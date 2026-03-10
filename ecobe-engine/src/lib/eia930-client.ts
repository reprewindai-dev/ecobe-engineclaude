/**
 * EIA-930 API Client
 *
 * Connects to the U.S. Energy Information Administration's Open Data API v2
 * to fetch real-time and historical electricity grid data.
 *
 * Three data streams:
 *   BALANCE    → demand, net generation, total interchange per BA per hour
 *   INTERCHANGE → power flows between balancing authorities
 *   SUBREGION  → generation by fuel type within each BA
 *
 * Auth: api_key query parameter (no bearer header)
 * Base: https://api.eia.gov/v2/
 *
 * Rate limits: 1000 requests/hour per key (EIA public policy)
 * Recommended: cache all responses with 5-minute TTL.
 *
 * API Reference: https://www.eia.gov/opendata/
 */

import axios from 'axios'
import { env } from '../config/env'
import { logger } from './logger'
import type { EIA930BalanceRow, EIA930InterchangeRow, EIA930SubregionRow } from './grid-signals/types'

const EIA_BASE = 'https://api.eia.gov/v2'

interface EIAResponse<T> {
  response: {
    total: number
    dateFormat?: string
    frequency?: string
    data: T[]
    warnings?: unknown[]
  }
  request?: unknown
}

export class EIA930Client {
  private readonly http: ReturnType<typeof axios.create>
  private readonly apiKey: string | undefined

  constructor() {
    this.apiKey = env.EIA930_API_KEY
    this.http = axios.create({
      baseURL: EIA_BASE,
      timeout: 15_000,
    })
  }

  private get hasKey(): boolean {
    return Boolean(this.apiKey)
  }

  private async get<T>(
    path: string,
    params: Record<string, unknown>,
  ): Promise<T[] | null> {
    if (!this.hasKey) {
      logger.debug('[eia930] EIA930_API_KEY not configured — skipping fetch')
      return null
    }
    try {
      const res = await this.http.get<EIAResponse<T>>(path, {
        params: { ...params, api_key: this.apiKey },
      })
      return res.data?.response?.data ?? []
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Unknown EIA-930 error'
      logger.warn({ path, msg }, '[eia930] fetch error')
      return null
    }
  }

  // ── BALANCE ─────────────────────────────────────────────────────────────────

  /**
   * Fetch BALANCE data (demand, net generation, total interchange) for one or more BAs.
   * Returns the most recent N hours.
   *
   * @param respondents  Array of EIA-930 BA codes, e.g. ['MIDA', 'CAL']
   * @param hours        Number of recent hourly rows to fetch (default: 24, max: 5000)
   */
  async fetchBalance(
    respondents: string[],
    hours = 24,
  ): Promise<EIA930BalanceRow[] | null> {
    const raw = await this.get<any>('/electricity/rto/region-data', {
      frequency: 'hourly',
      data: ['value'],
      facets: { respondent: respondents },
      sort: [{ column: 'period', direction: 'desc' }],
      offset: 0,
      length: Math.min(hours * respondents.length * 4, 5000), // 4 types per BA per hour
    })
    if (!raw) return null

    return raw.map((row: any): EIA930BalanceRow => ({
      period: row.period,
      respondent: row.respondent,
      respondentName: row['respondent-name'] ?? row.respondent,
      type: row.type,
      typeName: row['type-name'] ?? row.type,
      timezone: row.timezone ?? 'UTC',
      value: row.value != null ? Number(row.value) : null,
      valueUnits: row['value-units'] ?? 'megawatthours',
    }))
  }

  /**
   * Fetch BALANCE data for a specific date range.
   *
   * @param respondents  EIA-930 BA codes
   * @param start        ISO-8601 start (inclusive), e.g. "2026-03-01T00"
   * @param end          ISO-8601 end (exclusive), e.g. "2026-03-08T00"
   */
  async fetchBalanceRange(
    respondents: string[],
    start: string,
    end: string,
  ): Promise<EIA930BalanceRow[] | null> {
    const raw = await this.get<any>('/electricity/rto/region-data', {
      frequency: 'hourly',
      data: ['value'],
      facets: { respondent: respondents },
      start,
      end,
      sort: [{ column: 'period', direction: 'asc' }],
      offset: 0,
      length: 5000,
    })
    if (!raw) return null

    return raw.map((row: any): EIA930BalanceRow => ({
      period: row.period,
      respondent: row.respondent,
      respondentName: row['respondent-name'] ?? row.respondent,
      type: row.type,
      typeName: row['type-name'] ?? row.type,
      timezone: row.timezone ?? 'UTC',
      value: row.value != null ? Number(row.value) : null,
      valueUnits: row['value-units'] ?? 'megawatthours',
    }))
  }

  // ── INTERCHANGE ──────────────────────────────────────────────────────────────

  /**
   * Fetch INTERCHANGE data (power flows between BAs).
   * EIA-930 interchange shows directional MW flows between adjacent BAs.
   *
   * @param respondents  EIA-930 BA codes to include (as origin or destination)
   * @param hours        Number of recent hourly rows to fetch
   */
  async fetchInterchange(
    respondents: string[],
    hours = 24,
  ): Promise<EIA930InterchangeRow[] | null> {
    const raw = await this.get<any>('/electricity/rto/interchange-data', {
      frequency: 'hourly',
      data: ['value'],
      facets: { fromba: respondents },
      sort: [{ column: 'period', direction: 'desc' }],
      offset: 0,
      length: Math.min(hours * respondents.length * 10, 5000),
    })
    if (!raw) return null

    return raw.map((row: any): EIA930InterchangeRow => ({
      period: row.period,
      fromba: row.fromba,
      frombaName: row['fromba-name'] ?? row.fromba,
      toba: row.toba,
      tobaName: row['toba-name'] ?? row.toba,
      timezone: row.timezone ?? 'UTC',
      value: row.value != null ? Number(row.value) : null,
      valueUnits: row['value-units'] ?? 'megawatthours',
    }))
  }

  /**
   * Fetch INTERCHANGE for a date range.
   */
  async fetchInterchangeRange(
    respondents: string[],
    start: string,
    end: string,
  ): Promise<EIA930InterchangeRow[] | null> {
    const raw = await this.get<any>('/electricity/rto/interchange-data', {
      frequency: 'hourly',
      data: ['value'],
      facets: { fromba: respondents },
      start,
      end,
      sort: [{ column: 'period', direction: 'asc' }],
      offset: 0,
      length: 5000,
    })
    if (!raw) return null

    return raw.map((row: any): EIA930InterchangeRow => ({
      period: row.period,
      fromba: row.fromba,
      frombaName: row['fromba-name'] ?? row.fromba,
      toba: row.toba,
      tobaName: row['toba-name'] ?? row.toba,
      timezone: row.timezone ?? 'UTC',
      value: row.value != null ? Number(row.value) : null,
      valueUnits: row['value-units'] ?? 'megawatthours',
    }))
  }

  // ── SUBREGION (fuel mix) ─────────────────────────────────────────────────────

  /**
   * Fetch SUBREGION data (generation by fuel type within a BA).
   * Use this for fuel mix / renewable ratio computation.
   *
   * @param respondents  EIA-930 BA codes
   * @param hours        Number of recent hourly rows to fetch
   */
  async fetchSubregion(
    respondents: string[],
    hours = 24,
  ): Promise<EIA930SubregionRow[] | null> {
    const raw = await this.get<any>('/electricity/rto/region-sub-ba-data', {
      frequency: 'hourly',
      data: ['value'],
      facets: { respondent: respondents },
      sort: [{ column: 'period', direction: 'desc' }],
      offset: 0,
      length: Math.min(hours * respondents.length * 8, 5000), // ~8 fuel types per BA/hour
    })
    if (!raw) return null

    return raw.map((row: any): EIA930SubregionRow => ({
      period: row.period,
      respondent: row.respondent,
      respondentName: row['respondent-name'] ?? row.respondent,
      fueltype: row.fueltype ?? row['fuel-type'] ?? 'OTH',
      typeName: row['type-name'] ?? row.fueltype,
      timezone: row.timezone ?? 'UTC',
      value: row.value != null ? Number(row.value) : null,
      valueUnits: row['value-units'] ?? 'megawatthours',
    }))
  }

  /**
   * Fetch SUBREGION for a date range.
   */
  async fetchSubregionRange(
    respondents: string[],
    start: string,
    end: string,
  ): Promise<EIA930SubregionRow[] | null> {
    const raw = await this.get<any>('/electricity/rto/region-sub-ba-data', {
      frequency: 'hourly',
      data: ['value'],
      facets: { respondent: respondents },
      start,
      end,
      sort: [{ column: 'period', direction: 'asc' }],
      offset: 0,
      length: 5000,
    })
    if (!raw) return null

    return raw.map((row: any): EIA930SubregionRow => ({
      period: row.period,
      respondent: row.respondent,
      respondentName: row['respondent-name'] ?? row.respondent,
      fueltype: row.fueltype ?? row['fuel-type'] ?? 'OTH',
      typeName: row['type-name'] ?? row.fueltype,
      timezone: row.timezone ?? 'UTC',
      value: row.value != null ? Number(row.value) : null,
      valueUnits: row['value-units'] ?? 'megawatthours',
    }))
  }

  /** Convert EIA-930 period string "2026-03-09T18" to ISO-8601 UTC */
  static periodToISO(period: string): string {
    // "2026-03-09T18" → "2026-03-09T18:00:00Z"
    if (/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(period)) {
      return `${period}:00:00Z`
    }
    return period
  }
}

export const eia930 = new EIA930Client()
