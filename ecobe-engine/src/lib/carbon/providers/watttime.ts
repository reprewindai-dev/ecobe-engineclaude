/**
 * WattTime Provider Adapter — Full Implementation
 *
 * WattTime v3 API: https://docs.watttime.org/
 * Primary signal: MOER (Marginal Operating Emission Rate) — the emissions of the
 * NEXT unit of electricity demanded. More causal than average intensity for
 * demand-response decisions (shift compute from high-MOER to low-MOER windows).
 *
 * Auth flow:
 *   GET /login (Basic auth: username:password) → 30-min JWT
 *   GET /v3/data?region=<ba>&signal_type=co2_moer (Bearer JWT)
 *
 * Unit conversion:
 *   WattTime MOER is in lbs CO₂/MWh.
 *   CarbonSignal uses gCO₂eq/kWh.
 *   Conversion: gCO₂/kWh = lbs/MWh ÷ 2.205
 *   Derivation: 453.592 g/lb ÷ 1000 kWh/MWh = 0.4536 → divide by 2.205 equivalent
 *
 * Supported regions (ECOBE ↔ WattTime BA name mapping in region-map.ts):
 *   US-MIDA-PJM, US-CAL-CISO, US-TEX-ERCO, US-MIDW-MISO,
 *   US-NE-ISNE, US-NY-NYIS, US-SE-SERC, US-NW-BPAT,
 *   US-SW-SRP, US-SW-AZPS, US-FLA-FPL
 *
 * Credentials:
 *   WATTTIME_USERNAME + WATTTIME_PASSWORD (v3 primary).
 *   Falls back to WATTTIME_API_KEY treated as password with username 'api_key' (legacy).
 */

import axios from 'axios'
import { CarbonProvider } from '../provider-interface'
import { ProviderResult, CarbonSignal } from '../types'
import { regionToWatttimeBA, getAllSupportedRegions } from '../../grid-signals/region-map'
import { logger } from '../../logger'

const WATTTIME_BASE = 'https://api.watttime.org'

// lbs CO₂/MWh → gCO₂eq/kWh: divide by 2.205
const LBS_PER_MWH_TO_G_PER_KWH = 1 / 2.205

interface WattTimeLoginResponse {
  token: string
}

interface WattTimeMOERPoint {
  point_time: string   // ISO-8601
  value: number        // lbs CO₂/MWh
  version: string
}

interface WattTimeDataResponse {
  meta?: {
    region?: string
    signal_type?: string
    units?: string
  }
  data: WattTimeMOERPoint[]
}

// Token cache — reuse tokens until 2 minutes before expiry
interface TokenCache {
  token: string
  expiresAt: number    // unix ms
}

export class WattTimeProvider implements CarbonProvider {
  readonly name = 'watttime' as const

  private readonly http: ReturnType<typeof axios.create>
  private readonly username: string | undefined
  private readonly password: string | undefined
  private tokenCache: TokenCache | null = null

  constructor() {
    this.http = axios.create({
      baseURL: WATTTIME_BASE,
      timeout: 15_000,
    })

    const username = process.env.WATTTIME_USERNAME
    const password = process.env.WATTTIME_PASSWORD
    const apiKey = process.env.WATTTIME_API_KEY

    if (username && password) {
      this.username = username
      this.password = password
    } else if (apiKey) {
      // Legacy: treat API key as password with fixed username
      this.username = 'api_key'
      this.password = apiKey
    }
  }

  private get hasCredentials(): boolean {
    return Boolean(this.username && this.password)
  }

  supportsRegion(region: string): boolean {
    if (!this.hasCredentials) return false
    return getAllSupportedRegions().includes(region)
  }

  // ── Auth ─────────────────────────────────────────────────────────────────────

  private async getToken(): Promise<string | null> {
    if (!this.hasCredentials) return null

    // Return cached token if still valid (with 2-min buffer)
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt - 120_000) {
      return this.tokenCache.token
    }

    try {
      const res = await this.http.get<WattTimeLoginResponse>('/login', {
        auth: { username: this.username!, password: this.password! },
      })
      const token = res.data?.token
      if (!token) {
        logger.warn('[watttime] login succeeded but no token returned')
        return null
      }

      // JWT expires in 30 min; cache for 28 min
      this.tokenCache = {
        token,
        expiresAt: Date.now() + 28 * 60 * 1000,
      }
      return token
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'auth error'
      logger.warn({ msg }, '[watttime] login failed')
      return null
    }
  }

  private async get<T>(path: string, params: Record<string, unknown>): Promise<T | null> {
    const token = await this.getToken()
    if (!token) return null

    try {
      const res = await this.http.get<T>(path, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      })
      return res.data ?? null
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'unknown WattTime error'
      const status = err?.response?.status
      if (status === 401) {
        // Token expired — clear cache so next call re-authenticates
        this.tokenCache = null
      }
      logger.warn({ path, msg, status }, '[watttime] request failed')
      return null
    }
  }

  // ── Unit conversion ───────────────────────────────────────────────────────────

  private static toGCO2PerKwh(lbsPerMwh: number): number {
    return Math.round(lbsPerMwh * LBS_PER_MWH_TO_G_PER_KWH * 10) / 10
  }

  private static buildSignal(
    region: string,
    point: WattTimeMOERPoint,
    isForecast: boolean,
    fetchedAt: string,
  ): CarbonSignal {
    return {
      region,
      intensity_gco2_per_kwh: WattTimeProvider.toGCO2PerKwh(point.value),
      observed_time: isForecast ? null : point.point_time,
      forecast_time: isForecast ? point.point_time : null,
      fetched_at: fetchedAt,
      source: 'watttime',
      source_record_id: point.version,
      is_forecast: isForecast,
      confidence: 0.90,
      data_quality: 'high',
      fallback_used: false,
      validation_used: false,
      disagreement_flag: false,
      disagreement_pct: null,
      metadata: {
        moer_lbs_per_mwh: point.value,
        signal_type: 'co2_moer',
        version: point.version,
      },
    }
  }

  // ── CarbonProvider interface ──────────────────────────────────────────────────

  async getCurrentIntensity(region: string): Promise<ProviderResult> {
    if (!this.hasCredentials) {
      return {
        ok: false,
        signal: null,
        error_code: 'NO_CREDENTIALS',
        error_message: 'WATTTIME_USERNAME/PASSWORD or WATTTIME_API_KEY not configured',
      }
    }

    const baName = regionToWatttimeBA(region)
    if (!baName) {
      return {
        ok: false,
        signal: null,
        error_code: 'REGION_NOT_MAPPED',
        error_message: `No WattTime BA mapping for region '${region}'`,
      }
    }

    const fetchedAt = new Date().toISOString()
    const res = await this.get<WattTimeDataResponse>('/v3/data', {
      region: baName,
      signal_type: 'co2_moer',
    })

    if (!res?.data?.length) {
      return {
        ok: false,
        signal: null,
        error_code: 'NO_DATA',
        error_message: 'WattTime /v3/data returned no points',
      }
    }

    // Latest point (API returns descending order)
    const latest = res.data[0]

    return {
      ok: true,
      signal: WattTimeProvider.buildSignal(region, latest, false, fetchedAt),
    }
  }

  async getForecast(region: string, from: Date, to: Date): Promise<ProviderResult[]> {
    const baName = regionToWatttimeBA(region)
    if (!baName) return []

    const fetchedAt = new Date().toISOString()
    const res = await this.get<WattTimeDataResponse>('/v3/forecast', {
      region: baName,
      signal_type: 'co2_moer',
      start: from.toISOString(),
      end: to.toISOString(),
    })

    if (!res?.data?.length) return []

    return res.data
      .filter((pt) => {
        const t = new Date(pt.point_time).getTime()
        return t >= from.getTime() && t <= to.getTime()
      })
      .map((pt): ProviderResult => ({
        ok: true,
        signal: WattTimeProvider.buildSignal(region, pt, true, fetchedAt),
      }))
  }

  async getHistorical(region: string, from: Date, to: Date): Promise<ProviderResult[]> {
    const baName = regionToWatttimeBA(region)
    if (!baName) return []

    const fetchedAt = new Date().toISOString()
    const res = await this.get<WattTimeDataResponse>('/v3/historical', {
      region: baName,
      signal_type: 'co2_moer',
      start: from.toISOString(),
      end: to.toISOString(),
    })

    if (!res?.data?.length) return []

    return res.data.map((pt): ProviderResult => ({
      ok: true,
      signal: WattTimeProvider.buildSignal(region, pt, false, fetchedAt),
    }))
  }
}
