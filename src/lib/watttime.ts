import axios from 'axios'
import { env } from '../config/env'
import { recordIntegrationFailure, recordIntegrationSuccess } from './integration-metrics'
import { wattTimeResilience } from './resilience'

let token: string | null = null
let tokenExpiresAt: number | null = null

interface WattTimeAuthResponse {
  token: string
}

interface MOERData {
  ba: string
  moer: number
  percent: number
  point_time: string
  freq: string
}

interface MOERForecastData {
  ba: string
  point_time: string
  value: number
  version: string
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

  constructor() {
    this.baseUrl = env.WATTTIME_BASE_URL || 'https://api.watttime.org'
    this.username = env.WATTTIME_USERNAME
    this.password = env.WATTTIME_PASSWORD
  }

  private hasValidToken(): boolean {
    return Boolean(token && tokenExpiresAt && Date.now() < tokenExpiresAt - 60_000)
  }

  private async login(): Promise<string> {
    if (this.hasValidToken()) {
      return token as string
    }

    if (!this.username || !this.password) {
      const message = 'Missing WattTime credentials'
      await this.logFailure(message)
      throw new Error(message)
    }

    const startedAt = Date.now()
    try {
      const response = await wattTimeResilience.execute('watttime.login', () =>
        axios.get<WattTimeAuthResponse>(`${this.baseUrl}/login`, {
          auth: {
            username: this.username!,
            password: this.password!,
          },
          timeout: 8000,
          validateStatus: () => true,
        })
      )

      if (response.status !== 200 || !response.data?.token) {
        const message = `WattTime login failed with status ${response.status}`
        await this.logFailure(message, Date.now() - startedAt)
        throw new Error(message)
      }

      token = response.data.token
      tokenExpiresAt = Date.now() + 25 * 60 * 1000

      await this.logSuccess(Date.now() - startedAt)
      return token
    } catch (error: any) {
      const message = error?.message ?? 'Authentication failed'
      console.error('WattTime authentication failed:', message)
      await this.logFailure(message, Date.now() - startedAt)
      throw error instanceof Error ? error : new Error(message)
    }
  }

  private async withAuthHeaders(): Promise<Record<string, string>> {
    const t = await this.login()
    return { Authorization: `Bearer ${t}` }
  }

  private async requestWithAuth<T>(
    operation: string,
    url: string,
    config: {
      params?: Record<string, unknown>
      headers?: Record<string, string>
      timeout?: number
    } = {}
  ) {
    const startedAt = Date.now()
    const firstHeaders = {
      ...(config.headers ?? {}),
      ...(await this.withAuthHeaders()),
    }

    const firstResponse = await wattTimeResilience.execute(operation, () =>
      axios.get<T>(url, {
        ...config,
        headers: firstHeaders,
        timeout: config.timeout ?? 8000,
        validateStatus: () => true,
      })
    )

    if (firstResponse.status === 401) {
      token = null
      tokenExpiresAt = null
      const retryHeaders = {
        ...(config.headers ?? {}),
        ...(await this.withAuthHeaders()),
      }

      const retryResponse = await wattTimeResilience.execute(`${operation}:retry`, () =>
        axios.get<T>(url, {
          ...config,
          headers: retryHeaders,
          timeout: config.timeout ?? 8000,
          validateStatus: () => true,
        })
      )

      if (retryResponse.status !== 200) {
        const message = `WattTime ${operation} failed after retry with status ${retryResponse.status}`
        await this.logFailure(message, Date.now() - startedAt)
        throw new Error(message)
      }

      await this.logSuccess(Date.now() - startedAt)
      return retryResponse
    }

    if (firstResponse.status !== 200) {
      const message = `WattTime ${operation} failed with status ${firstResponse.status}`
      await this.logFailure(message, Date.now() - startedAt)
      throw new Error(message)
    }

    await this.logSuccess(Date.now() - startedAt)
    return firstResponse
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
    try {
      const response = await this.requestWithAuth<{
        data: Array<{ point_time: string; value: number }>
        meta: { region: string; signal_type: string; units: string; data_point_period_seconds: number }
      }>('watttime.getCurrentMOER', `${this.baseUrl}/v3/signal-index`, {
        params: {
          region: balancingAuthority,
          signal_type: 'co2_moer',
        },
      })

      const dataPoint = response.data.data?.[0]
      if (!dataPoint) {
        return null
      }

      // v3 signal-index returns percentile (0-100), not raw lbs/MWh
      // We normalize: percentile maps to approximate MOER for routing comparisons
      const result: WattTimeMOER = {
        balancingAuthority: response.data.meta.region,
        moer: dataPoint.value, // percentile 0-100 (lower = cleaner)
        moerPercent: dataPoint.value,
        timestamp: dataPoint.point_time,
        frequency: `${response.data.meta.data_point_period_seconds}s`,
      }
      return result
    } catch (error: any) {
      console.error(`Failed to fetch MOER for ${balancingAuthority}:`, error.message)
      return null
    }
  }

  async getMOERForecast(
    balancingAuthority: string,
    startTime?: Date,
    endTime?: Date
  ): Promise<WattTimeForecast[]> {
    try {
      const params: any = {
        region: balancingAuthority,
        signal_type: 'co2_moer',
      }

      if (startTime) {
        params.start = startTime.toISOString()
      }
      if (endTime) {
        params.end = endTime.toISOString()
      }

      const response = await this.requestWithAuth<{
        data: Array<{ point_time: string; value: number }>
        meta: { region: string; signal_type: string; model: { date: string } }
      }>('watttime.getMOERForecast', `${this.baseUrl}/v3/forecast`, {
        params,
      })

      const modelVersion = response.data.meta?.model?.date ?? 'unknown'
      const forecasts = (response.data.data || []).map((item) => ({
        balancingAuthority: response.data.meta?.region ?? balancingAuthority,
        timestamp: item.point_time,
        moer: item.value,
        version: modelVersion,
      }))
      return forecasts
    } catch (error: any) {
      console.error(`Failed to fetch MOER forecast for ${balancingAuthority}:`, error.message)
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
