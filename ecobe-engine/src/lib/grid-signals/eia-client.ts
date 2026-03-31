import axios from 'axios'
import { env } from '../../config/env'
import { recordIntegrationFailure, recordIntegrationSuccess } from '../integration-metrics'
import { eiaResilience } from '../resilience'
import { EIABalanceData, EIAInterchangeData, GridStatusFuelMixData } from './types'

const REQUEST_TIMEOUT_MS = 12000

type EIAResponse<T> = {
  response?: {
    data?: T[]
  }
}

type EIABalanceRow = {
  period: string
  respondent: string
  'respondent-name': string
  type: string
  value: string | number
  'value-units': string
}

type EIAInterchangeRow = {
  period: string
  fromba: string
  'fromba-name': string
  toba: string
  'toba-name': string
  value: string | number
  'value-units': string
}

type EIAFuelMixRow = {
  period: string
  respondent: string
  'respondent-name': string
  fueltype: string
  value: string | number
  'value-units': string
}

type FuelMixField =
  | 'coal'
  | 'hydro'
  | 'natural_gas'
  | 'nuclear'
  | 'other'
  | 'petroleum'
  | 'solar'
  | 'wind'
  | 'battery_storage'
  | 'pumped_storage'
  | 'solar_with_integrated_battery_storage'
  | 'unknown_energy_storage'
  | 'geothermal'
  | 'other_energy_storage'
  | 'wind_with_integrated_battery_storage'

const EIA_FUELTYPE_MAP: Record<string, FuelMixField> = {
  BAT: 'battery_storage',
  COL: 'coal',
  GEO: 'geothermal',
  NG: 'natural_gas',
  NUC: 'nuclear',
  OES: 'other_energy_storage',
  OIL: 'petroleum',
  OTH: 'other',
  PS: 'pumped_storage',
  SNB: 'solar_with_integrated_battery_storage',
  SUN: 'solar',
  UES: 'unknown_energy_storage',
  UNK: 'unknown_energy_storage',
  WAT: 'hydro',
  WNB: 'wind_with_integrated_battery_storage',
  WND: 'wind',
}

export class EIA930Client {
  private baseUrl: string
  private apiKey?: string

  constructor() {
    this.baseUrl = env.EIA_BASE_URL
    this.apiKey = env.EIA_API_KEY
  }

  private async logSuccess(latencyMs?: number) {
    try {
      await recordIntegrationSuccess('EIA_930', { latencyMs })
    } catch (error) {
      console.warn('Failed to record EIA-930 success metric:', error)
    }
  }

  private async logFailure(message: string, latencyMs?: number) {
    try {
      await recordIntegrationFailure('EIA_930', message, { latencyMs })
    } catch (error) {
      console.warn('Failed to record EIA-930 failure metric:', error)
    }
  }

  private formatHourlyPeriod(date: Date) {
    return date.toISOString().slice(0, 13)
  }

  private toNumericValue(value: string | number | null | undefined) {
    const parsed = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  private buildWindowParams(startTime?: Date, endTime?: Date) {
    const params: Record<string, string> = {}

    if (startTime) {
      params.start = this.formatHourlyPeriod(startTime)
    }
    if (endTime) {
      params.end = this.formatHourlyPeriod(endTime)
    }

    return params
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
      const params: any = {
        api_key: this.apiKey,
        frequency: 'hourly',
        data: ['value'],
        facets: {
          respondent: [balancingAuthority],
          type: ['D', 'NG', 'TI'], // Demand, Net Generation, Total Interchange
        },
        sort: [{ column: 'period', direction: 'desc' }],
        offset: 0,
        length: 5000,
        ...this.buildWindowParams(startTime, endTime),
      }

      const response = await eiaResilience.execute('getBalance', () =>
        axios.get<EIAResponse<EIABalanceRow>>(
          `${this.baseUrl}/electricity/rto/region-data/data/`,
          { params, timeout: REQUEST_TIMEOUT_MS }
        )
      )

      const records = (response.data.response?.data ?? [])
        .map((record) => {
          const value = this.toNumericValue(record.value)
          if (value === null) return null
          return {
            period: record.period,
            respondent: record.respondent,
            'respondent-name': record['respondent-name'],
            type: record.type,
            value,
            'value-units': record['value-units'],
          } satisfies EIABalanceData
        })
        .filter((record): record is EIABalanceData => record !== null)

      await this.logSuccess(Date.now() - startedAt)
      return records
    } catch (error: any) {
      console.error(`Failed to fetch EIA-930 balance for ${balancingAuthority}:`, error.message)
      await this.logFailure(error.message ?? 'Failed to fetch balance data', Date.now() - startedAt)
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
      const baseParams: any = {
        api_key: this.apiKey,
        frequency: 'hourly',
        data: ['value'],
        sort: [{ column: 'period', direction: 'desc' }],
        offset: 0,
        length: 5000,
        ...this.buildWindowParams(startTime, endTime),
      }

      const [fromResponse, toResponse] = await Promise.all([
        eiaResilience.execute('getInterchangeFrom', () =>
          axios.get<EIAResponse<EIAInterchangeRow>>(
            `${this.baseUrl}/electricity/rto/interchange-data/data/`,
            {
              params: {
                ...baseParams,
                facets: {
                  fromba: [balancingAuthority],
                },
              },
              timeout: REQUEST_TIMEOUT_MS,
            }
          )
        ),
        eiaResilience.execute('getInterchangeTo', () =>
          axios.get<EIAResponse<EIAInterchangeRow>>(
            `${this.baseUrl}/electricity/rto/interchange-data/data/`,
            {
              params: {
                ...baseParams,
                facets: {
                  toba: [balancingAuthority],
                },
              },
              timeout: REQUEST_TIMEOUT_MS,
            }
          )
        ),
      ])

      const deduped = new Map<string, EIAInterchangeData>()
      for (const record of [
        ...(fromResponse.data.response?.data ?? []),
        ...(toResponse.data.response?.data ?? []),
      ]) {
        const value = this.toNumericValue(record.value)
        if (value === null) continue

        const normalized = {
          period: record.period,
          'from-ba': record.fromba,
          'from-ba-name': record['fromba-name'],
          'to-ba': record.toba,
          'to-ba-name': record['toba-name'],
          type: 'ID',
          value,
          'value-units': record['value-units'],
        } satisfies EIAInterchangeData

        deduped.set(
          `${normalized.period}:${normalized['from-ba']}:${normalized['to-ba']}`,
          normalized
        )
      }

      await this.logSuccess(Date.now() - startedAt)
      return Array.from(deduped.values())
    } catch (error: any) {
      console.error(`Failed to fetch EIA-930 interchange for ${balancingAuthority}:`, error.message)
      await this.logFailure(error.message ?? 'Failed to fetch interchange data', Date.now() - startedAt)
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
      const params: any = {
        api_key: this.apiKey,
        frequency: 'hourly',
        data: ['value'],
        facets: {
          respondent: [balancingAuthority],
        },
        sort: [{ column: 'period', direction: 'desc' }],
        offset: 0,
        length: 5000,
        ...this.buildWindowParams(startTime, endTime),
      }

      const response = await eiaResilience.execute('getFuelMix', () =>
        axios.get<EIAResponse<EIAFuelMixRow>>(
          `${this.baseUrl}/electricity/rto/fuel-type-data/data/`,
          { params, timeout: REQUEST_TIMEOUT_MS }
        )
      )

      const grouped = new Map<string, GridStatusFuelMixData>()
      for (const record of response.data.response?.data ?? []) {
        const mappedField = EIA_FUELTYPE_MAP[record.fueltype]
        const numericValue = this.toNumericValue(record.value)
        if (!mappedField || numericValue === null) {
          continue
        }

        const existing =
          grouped.get(record.period) ??
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

        existing[mappedField] = (existing[mappedField] ?? 0) + numericValue
        grouped.set(record.period, existing)
      }

      await this.logSuccess(Date.now() - startedAt)
      return Array.from(grouped.values())
    } catch (error: any) {
      console.error(`Failed to fetch EIA-930 fuel mix for ${balancingAuthority}:`, error.message)
      await this.logFailure(error.message ?? 'Failed to fetch fuel mix data', Date.now() - startedAt)
      return []
    }
  }
}

export const eia930 = new EIA930Client()
