import axios from 'axios'
import { env } from '../../config/env'
import { recordIntegrationFailure, recordIntegrationSuccess } from '../integration-metrics'
import { eiaResilience } from '../resilience'
import { EIABalanceData, EIAInterchangeData, EIASubregionData, GridStatusFuelMixData } from './types'

const REQUEST_TIMEOUT = 15000

type EIAResponse<T> = {
  response?: {
    data?: T[]
  }
}

type EIAFacetMap = Record<string, string[]>

type EIABalanceApiRecord = {
  period: string
  respondent: string
  'respondent-name': string
  type: string
  value: string | number
  'value-units': string
}

type EIAInterchangeApiRecord = {
  period: string
  fromba: string
  'fromba-name': string
  toba: string
  'toba-name': string
  value: string | number
  'value-units': string
}

type EIASubregionApiRecord = {
  period: string
  parent: string
  'parent-name': string
  subba: string
  'subba-name': string
  value: string | number
  'value-units': string
}

type EIAFuelTypeApiRecord = {
  period: string
  respondent: string
  'respondent-name': string
  fueltype: string
  value: string | number
  'value-units': string
}

const FUELTYPE_TO_FIELD: Record<string, keyof GridStatusFuelMixData> = {
  COL: 'coal',
  WAT: 'hydro',
  NG: 'natural_gas',
  NUC: 'nuclear',
  OTH: 'other',
  OIL: 'petroleum',
  SUN: 'solar',
  WND: 'wind',
  GEO: 'geothermal',
  BAT: 'battery_storage',
  PHS: 'pumped_storage',
}

export class EIA930Client {
  private baseUrl: string
  private apiKey?: string

  constructor() {
    this.baseUrl = env.EIA_BASE_URL
    this.apiKey = env.EIA_API_KEY
  }

  get isAvailable(): boolean {
    return !!this.apiKey
  }

  private async logSuccess(latencyMs?: number) {
    try {
      await recordIntegrationSuccess('EIA_930', { latencyMs })
    } catch (error) {
      console.warn('Failed to record EIA-930 success metric:', error)
    }
  }

  private async logFailure(message: string, latencyMs?: number, statusCode?: number) {
    try {
      await recordIntegrationFailure('EIA_930', message, { latencyMs, statusCode })
    } catch (error) {
      console.warn('Failed to record EIA-930 failure metric:', error)
    }
  }

  private formatHourlyBoundary(date: Date): string {
    return date.toISOString().slice(0, 13)
  }

  private buildDatasetUrl(path: string, facets: EIAFacetMap, startTime?: Date, endTime?: Date): string {
    const params = new URLSearchParams()
    params.set('api_key', this.apiKey ?? '')
    params.set('frequency', 'hourly')
    params.set('data[0]', 'value')

    for (const [facet, values] of Object.entries(facets)) {
      for (const value of values) {
        params.append(`facets[${facet}][]`, value)
      }
    }

    if (startTime) params.set('start', this.formatHourlyBoundary(startTime))
    if (endTime) params.set('end', this.formatHourlyBoundary(endTime))

    params.set('sort[0][column]', 'period')
    params.set('sort[0][direction]', 'desc')
    params.set('offset', '0')
    params.set('length', '5000')

    return `${this.baseUrl.replace(/\/+$/, '')}/v2/${path}?${params.toString()}`
  }

  private parseNumber(value: string | number): number {
    const numeric = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(numeric) ? numeric : 0
  }

  private getErrorStatusCode(error: unknown): number | undefined {
    const maybeError = error as { response?: { status?: number } } | undefined
    const status = maybeError?.response?.status
    return typeof status === 'number' ? status : undefined
  }

  private async requestData<T>(
    operation: string,
    path: string,
    facets: EIAFacetMap,
    startTime?: Date,
    endTime?: Date
  ): Promise<T[]> {
    const url = this.buildDatasetUrl(path, facets, startTime, endTime)
    const response = await eiaResilience.execute(operation, () =>
      axios.get<EIAResponse<T>>(url, { timeout: REQUEST_TIMEOUT })
    )

    return response.data.response?.data || []
  }

  private aggregateFuelMix(records: EIAFuelTypeApiRecord[]): GridStatusFuelMixData[] {
    const grouped = new Map<string, GridStatusFuelMixData>()

    for (const record of records) {
      const key = `${record.respondent}::${record.period}`
      const aggregated =
        grouped.get(key) ??
        {
          interval_start_utc: record.period,
          interval_end_utc: record.period,
          respondent: record.respondent,
          respondent_name: record['respondent-name'],
          coal: null,
          hydro: null,
          natural_gas: null,
          nuclear: null,
          other: null,
          petroleum: null,
          solar: null,
          wind: null,
          battery_storage: null,
          pumped_storage: null,
          solar_with_integrated_battery_storage: null,
          unknown_energy_storage: null,
          geothermal: null,
          other_energy_storage: null,
          wind_with_integrated_battery_storage: null,
        }

      const field = FUELTYPE_TO_FIELD[record.fueltype]
      if (field) {
        ;(aggregated as unknown as Record<string, string | number | null>)[field] = this.parseNumber(record.value)
      }

      grouped.set(key, aggregated)
    }

    return Array.from(grouped.values()).sort(
      (a, b) => new Date(b.interval_start_utc).getTime() - new Date(a.interval_start_utc).getTime()
    )
  }

  async getBalance(
    balancingAuthority: string,
    startTime?: Date,
    endTime?: Date
  ): Promise<EIABalanceData[]> {
    if (!this.apiKey) {
      await this.logFailure('Missing EIA API key')
      return []
    }

    const startedAt = Date.now()

    try {
      const records = await this.requestData<EIABalanceApiRecord>(
        'eia-balance',
        'electricity/rto/region-data/data/',
        {
          respondent: [balancingAuthority],
          type: ['D', 'NG', 'TI'],
        },
        startTime,
        endTime
      )

      await this.logSuccess(Date.now() - startedAt)
      return records.map(record => ({
        period: record.period,
        respondent: record.respondent,
        'respondent-name': record['respondent-name'],
        type: record.type,
        value: this.parseNumber(record.value),
        'value-units': record['value-units'],
      }))
    } catch (error: any) {
      console.error(`Failed to fetch EIA-930 balance for ${balancingAuthority}:`, error.message)
      await this.logFailure(
        error.message ?? 'Failed to fetch balance data',
        Date.now() - startedAt,
        this.getErrorStatusCode(error)
      )
      return []
    }
  }

  async getInterchange(
    balancingAuthority: string,
    startTime?: Date,
    endTime?: Date
  ): Promise<EIAInterchangeData[]> {
    if (!this.apiKey) {
      await this.logFailure('Missing EIA API key')
      return []
    }

    const startedAt = Date.now()

    try {
      const [fromRecords, toRecords] = await Promise.all([
        this.requestData<EIAInterchangeApiRecord>(
          'eia-interchange-from',
          'electricity/rto/interchange-data/data/',
          { fromba: [balancingAuthority] },
          startTime,
          endTime
        ),
        this.requestData<EIAInterchangeApiRecord>(
          'eia-interchange-to',
          'electricity/rto/interchange-data/data/',
          { toba: [balancingAuthority] },
          startTime,
          endTime
        ),
      ])

      const seen = new Set<string>()
      const records: EIAInterchangeData[] = []

      for (const record of [...fromRecords, ...toRecords]) {
        const key = `${record.period}::${record.fromba}::${record.toba}::${record.value}`
        if (seen.has(key)) continue
        seen.add(key)

        records.push({
          period: record.period,
          'from-ba': record.fromba,
          'from-ba-name': record['fromba-name'],
          'to-ba': record.toba,
          'to-ba-name': record['toba-name'],
          type: 'ID',
          value: this.parseNumber(record.value),
          'value-units': record['value-units'],
        })
      }

      await this.logSuccess(Date.now() - startedAt)
      return records
    } catch (error: any) {
      console.error(`Failed to fetch EIA-930 interchange for ${balancingAuthority}:`, error.message)
      await this.logFailure(
        error.message ?? 'Failed to fetch interchange data',
        Date.now() - startedAt,
        this.getErrorStatusCode(error)
      )
      return []
    }
  }

  async getFuelMix(
    balancingAuthority: string,
    startTime?: Date,
    endTime?: Date
  ): Promise<GridStatusFuelMixData[]> {
    if (!this.apiKey) {
      await this.logFailure('Missing EIA API key')
      return []
    }

    const startedAt = Date.now()

    try {
      const records = await this.requestData<EIAFuelTypeApiRecord>(
        'eia-fuelmix',
        'electricity/rto/fuel-type-data/data/',
        { respondent: [balancingAuthority] },
        startTime,
        endTime
      )

      await this.logSuccess(Date.now() - startedAt)
      return this.aggregateFuelMix(records)
    } catch (error: any) {
      console.error(`Failed to fetch EIA-930 fuel mix for ${balancingAuthority}:`, error.message)
      await this.logFailure(
        error.message ?? 'Failed to fetch fuel mix data',
        Date.now() - startedAt,
        this.getErrorStatusCode(error)
      )
      return []
    }
  }

  async getSubregion(
    balancingAuthority: string,
    startTime?: Date,
    endTime?: Date
  ): Promise<EIASubregionData[]> {
    if (!this.apiKey) {
      await this.logFailure('Missing EIA API key')
      return []
    }

    const startedAt = Date.now()

    try {
      const records = await this.requestData<EIASubregionApiRecord>(
        'eia-subregion',
        'electricity/rto/region-sub-ba-data/data/',
        { parent: [balancingAuthority] },
        startTime,
        endTime
      )

      await this.logSuccess(Date.now() - startedAt)
      return records.map(record => ({
        period: record.period,
        respondent: record.parent,
        'respondent-name': record['parent-name'],
        parent: record.parent,
        'parent-name': record['parent-name'],
        subregion: record.subba,
        'subregion-name': record['subba-name'],
        type: 'NG',
        value: this.parseNumber(record.value),
        'value-units': record['value-units'],
      }))
    } catch (error: any) {
      console.error(`Failed to fetch EIA-930 subregion for ${balancingAuthority}:`, error.message)
      await this.logFailure(
        error.message ?? 'Failed to fetch subregion data',
        Date.now() - startedAt,
        this.getErrorStatusCode(error)
      )
      return []
    }
  }
}

export const eia930 = new EIA930Client()
