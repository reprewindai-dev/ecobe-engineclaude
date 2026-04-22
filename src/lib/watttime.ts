import axios from 'axios'
import { env } from '../config/env'
import { recordIntegrationFailure, recordIntegrationSuccess } from './integration-metrics'
import { wattTimeResilience } from './resilience'

interface WattTimeAuthResponse {
  token: string
}

type WattTimeSignalResponse = {
  data?: Array<{ point_time: string; value: number }>
  meta?: {
    region?: string
    signal_type?: string
    units?: string
    data_point_period_seconds?: number
    model?: { date?: string }
  }
}

type WattTimeHttpResponse<T> = {
  status: number
  data: T
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

const WATTTIME_BASE_URL = env.WTT_BASE_URL || env.WATTTIME_BASE_URL || 'https://api.watttime.org'
const WATTTIME_TIMEOUT_MS = 8_000
const WATTTIME_TOKEN_TTL_MS = 25 * 60 * 1000
const WATTTIME_REFRESH_MARGIN_MS = 60_000

let token: string | null = null
let tokenExpiresAt: number | null = null

function clearTokenCache() {
  token = null
  tokenExpiresAt = null
}

async function logSuccess(latencyMs?: number) {
  try {
    await recordIntegrationSuccess('WATTTIME', { latencyMs })
  } catch (error) {
    console.warn('Failed to record WattTime success metric:', error)
  }
}

async function logFailure(message: string, latencyMs?: number) {
  try {
    await recordIntegrationFailure('WATTTIME', message, { latencyMs })
  } catch (error) {
    console.warn('Failed to record WattTime failure metric:', error)
  }
}

async function login(): Promise<string> {
  if (token && tokenExpiresAt && Date.now() < tokenExpiresAt - WATTTIME_REFRESH_MARGIN_MS) {
    return token
  }

  const username = env.WATTTIME_USERNAME
  const password = env.WATTTIME_PASSWORD
  if (!username || !password) {
    const message = 'Missing WattTime credentials'
    await logFailure(message)
    throw new Error(message)
  }

  const startedAt = Date.now()
  const response = await wattTimeResilience.execute('login', () =>
    axios.get<WattTimeAuthResponse>(`${WATTTIME_BASE_URL}/login`, {
      auth: {
        username,
        password,
      },
      timeout: WATTTIME_TIMEOUT_MS,
      validateStatus: () => true,
    })
  )

  if (response.status !== 200) {
    const message = `WattTime login failed with status ${response.status}`
    console.error(message, {
      status: response.status,
      body: response.data,
    })
    await logFailure(message, Date.now() - startedAt)
    throw new Error(message)
  }

  const rspToken = response.data?.token
  if (!rspToken) {
    const message = 'WattTime login response did not include a token'
    await logFailure(message, Date.now() - startedAt)
    throw new Error(message)
  }

  token = rspToken
  tokenExpiresAt = Date.now() + WATTTIME_TOKEN_TTL_MS
  await logSuccess(Date.now() - startedAt)
  return token
}

async function withAuthHeaders(): Promise<Record<string, string>> {
  const t = await login()
  return { Authorization: `Bearer ${t}` }
}

async function getJsonWithRetry<T>(
  operation: string,
  path: string,
  params?: Record<string, string | number | boolean | undefined>
): Promise<WattTimeHttpResponse<T>> {
  const startedAt = Date.now()

  const run = async () =>
    axios.get<T>(`${WATTTIME_BASE_URL}${path}`, {
      params,
      headers: await withAuthHeaders(),
      timeout: WATTTIME_TIMEOUT_MS,
      validateStatus: () => true,
    })

  try {
    let response = await wattTimeResilience.execute(operation, run)

    if (response.status === 401) {
      clearTokenCache()
      response = await wattTimeResilience.execute(`${operation}:retry`, run)
    }

    if (response.status !== 200) {
      const message = `WattTime ${operation} failed with status ${response.status}`
      console.error(message, {
        status: response.status,
        body: response.data,
      })
      await logFailure(message, Date.now() - startedAt)
      throw new Error(message)
    }

    await logSuccess(Date.now() - startedAt)
    return response as WattTimeHttpResponse<T>
  } catch (error: any) {
    const message = error instanceof Error ? error.message : `WattTime ${operation} request failed`
    await logFailure(message, Date.now() - startedAt)
    throw error
  }
}

export class WattTimeClient {
  async getCurrentMOER(balancingAuthority: string): Promise<WattTimeMOER | null> {
    const response = await getJsonWithRetry<WattTimeSignalResponse>(
      'getCurrentMOER',
      '/v3/signal-index',
      {
        region: balancingAuthority,
        signal_type: 'co2_moer',
      }
    )

    const dataPoint = response.data.data?.[0]
    if (!dataPoint) {
      return null
    }

    return {
      balancingAuthority: response.data.meta?.region ?? balancingAuthority,
      moer: dataPoint.value,
      moerPercent: dataPoint.value,
      timestamp: dataPoint.point_time,
      frequency: `${response.data.meta?.data_point_period_seconds ?? 0}s`,
    }
  }

  async getMOERForecast(
    balancingAuthority: string,
    startTime?: Date,
    endTime?: Date
  ): Promise<WattTimeForecast[]> {
    const params: Record<string, string> = {
      region: balancingAuthority,
      signal_type: 'co2_moer',
    }

    if (startTime) {
      params.start = startTime.toISOString()
    }
    if (endTime) {
      params.end = endTime.toISOString()
    }

    const response = await getJsonWithRetry<WattTimeSignalResponse>('getMOERForecast', '/v3/forecast', params)
    const modelVersion = response.data.meta?.model?.date ?? 'unknown'

    return (response.data.data ?? []).map((item: { point_time: string; value: number }) => ({
      balancingAuthority: response.data.meta?.region ?? balancingAuthority,
      timestamp: item.point_time,
      moer: item.value,
      version: modelVersion,
    }))
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

    const sorted = [...forecasts].sort((a, b) => a.moer - b.moer)
    const threshold = sorted[Math.floor(sorted.length * 0.2)]?.moer ?? sorted[0].moer

    const cleanWindows: CleanWindow[] = []
    let currentWindow: WattTimeForecast[] = []

    for (const forecast of forecasts) {
      if (forecast.moer <= threshold) {
        currentWindow.push(forecast)
      } else if (currentWindow.length > 0) {
        const avgMoer = currentWindow.reduce((sum, f) => sum + f.moer, 0) / currentWindow.length
        cleanWindows.push({
          balancingAuthority,
          startTime: currentWindow[0].timestamp,
          endTime: currentWindow[currentWindow.length - 1].timestamp,
          avgMoer,
          confidence: 0.8,
        })
        currentWindow = []
      }
    }

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
        ? this.getMOERForecast(balancingAuthority, alternativeTime, alternativeTime).then(
            (forecasts) => forecasts[0]?.moer ?? null
          )
        : null,
    ])

    if (!currentMoer) {
      return null
    }

    const baseMoer = alternativeMoer ?? currentMoer.moer
    void executionTime

    return (baseMoer - currentMoer.moer) * energyMwh * 1000
  }
}

export const wattTime = new WattTimeClient()
export { login as __loginForTestsOnly, withAuthHeaders as __withAuthHeadersForTestsOnly, clearTokenCache as __clearWattTimeTokenCacheForTestsOnly }
