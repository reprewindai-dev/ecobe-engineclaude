import axios from 'axios'
import { env } from '../config/env'
import { recordIntegrationFailure, recordIntegrationSuccess } from './integration-metrics'
import { wattTimeResilience } from './resilience'

interface WattTimeAuthResponse {
  token: string
}

interface WattTimeV3Point {
  point_time: string
  value: number
}

interface WattTimeV3Metadata {
  region?: string
  signal_type?: string
  units?: string
  data_point_period_seconds?: number
  generated_at?: string
  generated_at_period_seconds?: number
  model?: {
    date?: string
  } | null
}

interface WattTimeV3Response {
  data?: WattTimeV3Point[]
  meta?: WattTimeV3Metadata
}

export interface WattTimeMOER {
  balancingAuthority: string
  moer: number
  moerPercent: number
  timestamp: string
  frequency: string
}

export interface WattTimeForecast {
  balancingAuthority: string
  timestamp: string
  moer: number
  version: string
}

export interface CleanWindow {
  balancingAuthority: string
  startTime: string
  endTime: string
  avgMoer: number
  confidence: number
}

export class WattTimeClient {
  private baseUrl: string
  private username?: string
  private password?: string
  private token?: string
  private tokenExpiry?: Date

  constructor() {
    this.baseUrl = env.WATTTIME_BASE_URL || 'https://api.watttime.org'
    this.username = env.WATTTIME_USERNAME
    this.password = env.WATTTIME_PASSWORD
  }

  private parseNumericValue(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number.parseFloat(value)
      return Number.isFinite(parsed) ? parsed : null
    }

    return null
  }

  private buildFrequency(seconds?: number | null): string {
    if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0) {
      return `${Math.round(seconds)}s`
    }
    return '300s'
  }

  private filterForecastWindow(
    forecasts: WattTimeForecast[],
    startTime?: Date,
    endTime?: Date
  ): WattTimeForecast[] {
    if (!startTime && !endTime) {
      return forecasts
    }

    const startMs = startTime?.getTime()
    const endMs = endTime?.getTime() ?? startMs

    const filtered = forecasts.filter((forecast) => {
      const pointTimeMs = new Date(forecast.timestamp).getTime()
      if (!Number.isFinite(pointTimeMs)) return false
      if (typeof startMs === 'number' && pointTimeMs < startMs) return false
      if (typeof endMs === 'number' && pointTimeMs > endMs) return false
      return true
    })

    if (filtered.length > 0) {
      return filtered
    }

    if (startTime && !endTime && forecasts.length > 0) {
      const targetMs = startTime.getTime()
      const closest = [...forecasts]
        .map((forecast) => ({
          forecast,
          distance: Math.abs(new Date(forecast.timestamp).getTime() - targetMs),
        }))
        .sort((a, b) => a.distance - b.distance)[0]

      return closest ? [closest.forecast] : []
    }

    return []
  }

  private async authenticate(): Promise<string | null> {
    if (!this.username || !this.password) {
      await this.logFailure('Missing WattTime credentials')
      return null
    }

    // Check if we have a valid token
    if (this.token && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.token
    }

    const startedAt = Date.now()
    try {
      const response = await wattTimeResilience.execute('authenticate', () =>
        axios.get<WattTimeAuthResponse>(
          `${this.baseUrl}/login`,
          {
            auth: {
              username: this.username!,
              password: this.password!,
            },
            timeout: 8000,
          }
        )
      )

      this.token = response.data.token
      // Token expires in 25 minutes (reduced from 30 to avoid edge cases)
      this.tokenExpiry = new Date(Date.now() + 25 * 60 * 1000)

      await this.logSuccess(Date.now() - startedAt)
      return this.token ?? null
    } catch (error: any) {
      console.error('WattTime authentication failed:', error.message)
      await this.logFailure(error.message ?? 'Authentication failed', Date.now() - startedAt)
      return null
    }
  }

  private async logSuccess(latencyMs?: number) {
    try {
      await recordIntegrationSuccess('WATTTIME', { latencyMs })
    } catch (error) {
      console.warn('Failed to record WattTime success metric:', error)
    }
  }

  private async logFailure(message: string, latencyMs?: number) {
    try {
      await recordIntegrationFailure('WATTTIME', message, { latencyMs })
    } catch (error) {
      console.warn('Failed to record WattTime failure metric:', error)
    }
  }

  async getCurrentMOER(balancingAuthority: string): Promise<WattTimeMOER | null> {
    const token = await this.authenticate()
    if (!token) {
      return null
    }

    const startedAt = Date.now()
    try {
      // v3/forecast with horizon_hours=0 is WattTime's current real-time MOER source.
      // If the account/region lacks forecast access, fall back to the free signal index.
      try {
        const response = await wattTimeResilience.execute('getCurrentMOERForecast', () =>
          axios.get<WattTimeV3Response>(
            `${this.baseUrl}/v3/forecast`,
            {
              params: {
                region: balancingAuthority,
                signal_type: 'co2_moer',
                horizon_hours: 0,
              },
              headers: {
                Authorization: `Bearer ${token}`,
              },
              timeout: 8000,
            }
          )
        )

        const dataPoint = response.data.data?.[0]
        const moer = this.parseNumericValue(dataPoint?.value)
        if (dataPoint?.point_time && moer !== null) {
          const result: WattTimeMOER = {
            balancingAuthority: response.data.meta?.region ?? balancingAuthority,
            moer,
            moerPercent: moer,
            timestamp: dataPoint.point_time,
            frequency: this.buildFrequency(response.data.meta?.data_point_period_seconds),
          }

          await this.logSuccess(Date.now() - startedAt)
          return result
        }
      } catch (error) {
        // Forecast access is plan-gated for many regions. Fall back to signal-index below.
      }

      const response = await wattTimeResilience.execute('getCurrentMOERSignalIndex', () =>
        axios.get<WattTimeV3Response>(
          `${this.baseUrl}/v3/signal-index`,
          {
            params: {
              region: balancingAuthority,
              signal_type: 'co2_moer',
            },
            headers: {
              Authorization: `Bearer ${token}`,
            },
            timeout: 8000,
          }
        )
      )

      const dataPoint = response.data.data?.[0]
      const signalIndex = this.parseNumericValue(dataPoint?.value)
      if (!dataPoint?.point_time || signalIndex === null) {
        await this.logFailure('No current WattTime datapoint returned', Date.now() - startedAt)
        return null
      }

      const result: WattTimeMOER = {
        balancingAuthority: response.data.meta?.region ?? balancingAuthority,
        moer: signalIndex,
        moerPercent: signalIndex,
        timestamp: dataPoint.point_time,
        frequency: this.buildFrequency(response.data.meta?.data_point_period_seconds),
      }

      await this.logSuccess(Date.now() - startedAt)
      return result
    } catch (error: any) {
      console.error(`Failed to fetch MOER for ${balancingAuthority}:`, error.message)
      await this.logFailure(error.message ?? 'Failed to fetch MOER', Date.now() - startedAt)
      return null
    }
  }

  async getMOERForecast(
    balancingAuthority: string,
    startTime?: Date,
    endTime?: Date
  ): Promise<WattTimeForecast[]> {
    const token = await this.authenticate()
    if (!token) {
      return []
    }

    const startedAt = Date.now()
    try {
      const now = Date.now()
      const targetStart = startTime ?? new Date(now)
      const targetEnd = endTime ?? startTime ?? new Date(now + 24 * 60 * 60 * 1000)
      const horizonHours = Math.min(
        72,
        Math.max(0, Math.ceil((targetEnd.getTime() - now) / (60 * 60 * 1000)) + 1)
      )

      const params: Record<string, unknown> = {
        region: balancingAuthority,
        signal_type: 'co2_moer',
        horizon_hours: horizonHours,
      }

      const response = await wattTimeResilience.execute('getMOERForecast', () =>
        axios.get<WattTimeV3Response>(
          `${this.baseUrl}/v3/forecast`,
          {
            params,
            headers: {
              Authorization: `Bearer ${token}`,
            },
            timeout: 8000,
          }
        )
      )

      const modelVersion = response.data.meta?.model?.date ?? 'unknown'
      const forecasts = (response.data.data || [])
        .map((item) => {
          const moer = this.parseNumericValue(item.value)
          if (!item.point_time || moer === null) {
            return null
          }

          return {
            balancingAuthority: response.data.meta?.region ?? balancingAuthority,
            timestamp: item.point_time,
            moer,
            version: modelVersion,
          } satisfies WattTimeForecast
        })
        .filter((forecast): forecast is WattTimeForecast => forecast !== null)

      const filteredForecasts = this.filterForecastWindow(forecasts, startTime, endTime)

      await this.logSuccess(Date.now() - startedAt)
      return filteredForecasts
    } catch (error: any) {
      console.error(`Failed to fetch MOER forecast for ${balancingAuthority}:`, error.message)
      await this.logFailure(error.message ?? 'Failed to fetch MOER forecast', Date.now() - startedAt)
      return []
    }
  }

  async getPredictedCleanWindows(
    balancingAuthority: string,
    hoursAhead: number = 24
  ): Promise<CleanWindow[]> {
    const forecasts = await this.getMOERForecast(
      balancingAuthority,
      new Date(),
      new Date(Date.now() + hoursAhead * 60 * 60 * 1000)
    )

    if (forecasts.length === 0) {
      return []
    }

    // Sort by MOER value
    const sorted = [...forecasts].sort((a, b) => a.moer - b.moer)
    
    // Find clean windows (bottom 20% MOER values)
    const threshold = sorted[Math.floor(sorted.length * 0.2)].moer
    
    const cleanWindows: CleanWindow[] = []
    let currentWindow: WattTimeForecast[] = []

    for (const forecast of forecasts) {
      if (forecast.moer <= threshold) {
        currentWindow.push(forecast)
      } else if (currentWindow.length > 0) {
        // Window ended
        const avgMoer = currentWindow.reduce((sum, f) => sum + f.moer, 0) / currentWindow.length
        cleanWindows.push({
          balancingAuthority,
          startTime: currentWindow[0].timestamp,
          endTime: currentWindow[currentWindow.length - 1].timestamp,
          avgMoer,
          confidence: 0.8, // High confidence for WattTime
        })
        currentWindow = []
      }
    }

    // Handle last window
    if (currentWindow.length > 0) {
      const avgMoer = currentWindow.reduce((sum, f) => sum + f.moer, 0) / currentWindow.length
      cleanWindows.push({
        balancingAuthority,
        startTime: currentWindow[0].timestamp,
        endTime: currentWindow[currentWindow.length - 1].timestamp,
        avgMoer,
        confidence: 0.8,
      })
    }

    return cleanWindows
  }

  async calculateAvoidedEmissions(
    balancingAuthority: string,
    energyMwh: number,
    executionTime: Date,
    alternativeTime?: Date
  ): Promise<number | null> {
    const [currentMoer, alternativeMoer] = await Promise.all([
      this.getCurrentMOER(balancingAuthority),
      alternativeTime
        ? this.getMOERForecast(balancingAuthority, alternativeTime, alternativeTime)
            .then(forecasts => forecasts[0]?.moer ?? null)
        : null,
    ])

    if (!currentMoer) {
      return null
    }

    const baseMoer = alternativeMoer ?? currentMoer.moer
    const avoidedEmissionsKg = (baseMoer - currentMoer.moer) * energyMwh * 1000

    return avoidedEmissionsKg
  }
}

export const wattTime = new WattTimeClient()
