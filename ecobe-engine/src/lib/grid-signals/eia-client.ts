import axios from 'axios'
import { env } from '../../config/env'
import { recordIntegrationFailure, recordIntegrationSuccess } from '../integration-metrics'
import { eiaResilience } from '../resilience'
import { EIABalanceData, EIAInterchangeData, EIASubregionData, GridStatusFuelMixData } from './types'

const EIA_GRIDMONITOR_PUBLIC_API_URL = 'https://www.eia.gov/electricity/930-api'
const EIA_GRIDMONITOR_PUBLIC_API_KEY = '3zjKYxV86AqtJWSRoAECir1wQFscVu6lxXnRVKG8'

interface PublicFuelMixSeriesEntry {
  RESPONDENT_ID: string
  RESPONDENT_NAME: string
  FUEL_TYPE_ID: string
  FUEL_TYPE_NAME: string
  VALUES?: {
    DATES?: string[]
    DATA?: Array<number | null>
  }
}

interface PublicFuelMixSeriesResponse {
  data?: PublicFuelMixSeriesEntry[]
}

export class EIA930Client {
  private baseUrl: string
  private apiKey?: string

  constructor() {
    this.baseUrl = env.EIA_BASE_URL
    this.apiKey = env.EIA_API_KEY
  }

  get mode(): 'private_api_key' | 'public_gridmonitor' {
    return this.apiKey ? 'private_api_key' : 'public_gridmonitor'
  }

  get isAvailable(): boolean {
    return Boolean(this.resolveApiKey())
  }

  private resolveApiKey(): string {
    return this.apiKey ?? EIA_GRIDMONITOR_PUBLIC_API_KEY
  }

  private format930ApiDate(date: Date): string {
    const month = `${date.getUTCMonth() + 1}`.padStart(2, '0')
    const day = `${date.getUTCDate()}`.padStart(2, '0')
    const year = `${date.getUTCFullYear()}`
    const hours = `${date.getUTCHours()}`.padStart(2, '0')
    const minutes = `${date.getUTCMinutes()}`.padStart(2, '0')
    const seconds = `${date.getUTCSeconds()}`.padStart(2, '0')
    return `${month}${day}${year} ${hours}:${minutes}:${seconds}`
  }

  private parse930ApiTimestamp(timestamp: string): string {
    const [datePart, timePart] = timestamp.split(' ')
    const [month, day, year] = datePart.split('/').map(part => parseInt(part, 10))
    const [hour, minute, second] = timePart.split(':').map(part => parseInt(part, 10))
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second)).toISOString()
  }

  private fuelTypeToField(fuelTypeId: string): keyof GridStatusFuelMixData | null {
    switch (fuelTypeId) {
      case 'BAT':
        return 'battery_storage'
      case 'COL':
        return 'coal'
      case 'GEO':
        return 'geothermal'
      case 'NG':
        return 'natural_gas'
      case 'NUC':
        return 'nuclear'
      case 'OIL':
      case 'PET':
        return 'petroleum'
      case 'OTH':
        return 'other'
      case 'PS':
        return 'pumped_storage'
      case 'SUN':
        return 'solar'
      case 'WAT':
        return 'hydro'
      case 'WND':
        return 'wind'
      default:
        return null
    }
  }

  async getFuelMix(
    balancingAuthority: string,
    startTime?: Date,
    endTime?: Date
  ): Promise<GridStatusFuelMixData[]> {
    try {
      const params: Record<string, string> = {
        'respondent[0]': balancingAuthority,
        frequency: 'hourly',
        timezone: 'UTC',
      }

      if (startTime) {
        params.start = this.format930ApiDate(startTime)
      }
      if (endTime) {
        params.end = this.format930ApiDate(endTime)
      }

      const response = await eiaResilience.execute('getFuelMixPublic930', () =>
        axios.get<PublicFuelMixSeriesResponse[]>(
          `${EIA_GRIDMONITOR_PUBLIC_API_URL}/region_data_by_fuel_type/series_data`,
          { params, timeout: 12000 }
        )
      )

      await this.logSuccess()

      const rows = response.data?.[0]?.data ?? []
      const grouped = new Map<string, GridStatusFuelMixData>()

      for (const row of rows) {
        const field = this.fuelTypeToField(row.FUEL_TYPE_ID)
        if (!field) {
          continue
        }

        const dates = row.VALUES?.DATES ?? []
        const values = row.VALUES?.DATA ?? []
        for (let index = 0; index < Math.min(dates.length, values.length); index++) {
          const rawValue = values[index]
          if (typeof rawValue !== 'number') {
            continue
          }

          const timestamp = this.parse930ApiTimestamp(dates[index])
          const existing = grouped.get(timestamp) ?? {
            interval_start_utc: timestamp,
            interval_end_utc: new Date(new Date(timestamp).getTime() + 60 * 60 * 1000).toISOString(),
            respondent: row.RESPONDENT_ID,
            respondent_name: row.RESPONDENT_NAME,
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

          ;(existing as unknown as Record<string, number | string | null>)[field] = rawValue
          grouped.set(timestamp, existing)
        }
      }

      return Array.from(grouped.values()).sort(
        (left, right) =>
          new Date(left.interval_start_utc).getTime() - new Date(right.interval_start_utc).getTime()
      )
    } catch (error: any) {
      console.error(`Failed to fetch public EIA-930 fuel mix for ${balancingAuthority}:`, error.message)
      await this.logFailure(error.message ?? 'Failed to fetch public fuel mix data')
      return []
    }
  }

  private async logSuccess() {
    try {
      await recordIntegrationSuccess('EIA_930')
    } catch (error) {
      console.warn('Failed to record EIA-930 success metric:', error)
    }
  }

  private async logFailure(message: string) {
    try {
      await recordIntegrationFailure('EIA_930', message)
    } catch (error) {
      console.warn('Failed to record EIA-930 failure metric:', error)
    }
  }

  async getBalance(
    balancingAuthority: string,
    startTime?: Date,
    endTime?: Date
  ): Promise<EIABalanceData[]> {
    try {
      const params: any = {
        api_key: this.resolveApiKey(),
        frequency: 'hourly',
        data: ['value'],
        facets: {
          respondent: [balancingAuthority],
          type: ['D', 'NG', 'TI'], // Demand, Net Generation, Total Interchange
        },
        sort: [{ column: 'period', direction: 'desc' }],
        offset: 0,
        length: 5000,
      }

      if (startTime) {
        params.start = startTime.toISOString().slice(0, 10)
      }
      if (endTime) {
        params.end = endTime.toISOString().slice(0, 10)
      }

      const response = await eiaResilience.execute('getBalance', () =>
        axios.get<{ response: { data: EIABalanceData[] } }>(
          `${this.baseUrl}/electricity/rto/region-data/data/`,
          { params, timeout: 12000 }
        )
      )

      await this.logSuccess()
      return response.data.response.data || []
    } catch (error: any) {
      console.error(`Failed to fetch EIA-930 balance for ${balancingAuthority}:`, error.message)
      await this.logFailure(error.message ?? 'Failed to fetch balance data')
      return []
    }
  }

  async getInterchange(
    balancingAuthority: string,
    startTime?: Date,
    endTime?: Date
  ): Promise<EIAInterchangeData[]> {
    try {
      const params: any = {
        api_key: this.resolveApiKey(),
        frequency: 'hourly',
        data: ['value'],
        facets: {
          fromba: [balancingAuthority],
        },
        sort: [{ column: 'period', direction: 'desc' }],
        offset: 0,
        length: 5000,
      }

      if (startTime) {
        params.start = startTime.toISOString().slice(0, 10)
      }
      if (endTime) {
        params.end = endTime.toISOString().slice(0, 10)
      }

      const response = await eiaResilience.execute('getInterchange', () =>
        axios.get<{ response: { data: EIAInterchangeData[] } }>(
          `${this.baseUrl}/electricity/rto/interchange-data/data/`,
          { params, timeout: 12000 }
        )
      )

      await this.logSuccess()
      return response.data.response.data || []
    } catch (error: any) {
      console.error(`Failed to fetch EIA-930 interchange for ${balancingAuthority}:`, error.message)
      await this.logFailure(error.message ?? 'Failed to fetch interchange data')
      return []
    }
  }

  async getSubregion(
    balancingAuthority: string,
    startTime?: Date,
    endTime?: Date
  ): Promise<EIASubregionData[]> {
    try {
      const params: any = {
        'respondent[0]': balancingAuthority,
        frequency: 'hourly',
        timezone: 'UTC',
      }

      if (startTime) {
        params.start = this.format930ApiDate(startTime)
      }
      if (endTime) {
        params.end = this.format930ApiDate(endTime)
      }

      const response = await eiaResilience.execute('getSubregion', () =>
        axios.get<Array<{ data?: Array<Record<string, unknown>> }>>(
          `${EIA_GRIDMONITOR_PUBLIC_API_URL}/region_data_by_sub_ba/data`,
          { params, timeout: 12000 }
        )
      )

      await this.logSuccess()
      const rows = response.data?.[0]?.data ?? []
      return rows.map((row) => ({
        period: typeof row.TIMESTAMP_ === 'string' ? this.parse930ApiTimestamp(row.TIMESTAMP_) : '',
        respondent: String(row.RESPONDENT_ID ?? balancingAuthority),
        'respondent-name': String(row.RESPONDENT_NAME ?? balancingAuthority),
        parent: String(row.RESPONDENT_ID ?? balancingAuthority),
        'parent-name': String(row.RESPONDENT_NAME ?? balancingAuthority),
        subregion: String(row.SUB_BA_ID ?? ''),
        'subregion-name': String(row.SUB_BA_NAME ?? ''),
        type: String(row.TYPE_ID ?? ''),
        value: Number(row.VAL ?? 0),
        'value-units': 'megawatthours',
      }))
    } catch (error: any) {
      console.error(`Failed to fetch EIA-930 subregion for ${balancingAuthority}:`, error.message)
      await this.logFailure(error.message ?? 'Failed to fetch subregion data')
      return []
    }
  }
}

export const eia930 = new EIA930Client()
