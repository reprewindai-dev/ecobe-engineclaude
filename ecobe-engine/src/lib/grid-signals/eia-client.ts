import axios from 'axios'
import { env } from '../../config/env'
import { recordIntegrationFailure, recordIntegrationSuccess } from '../integration-metrics'
import { eiaResilience } from '../resilience'
import { EIABalanceData, EIAInterchangeData, EIASubregionData } from './types'

type EiaBalanceApiRecord = {
  period: string
  respondent: string
  'respondent-name': string
  type: string
  value: string | number
  'value-units': string
}

type EiaInterchangeApiRecord = {
  period: string
  fromba: string
  'fromba-name': string
  toba: string
  'toba-name': string
  value: string | number
  'value-units': string
}

function normalizeEiaPeriod(period: string): string {
  const trimmed = period.trim()
  if (/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(trimmed)) {
    return `${trimmed}:00:00.000Z`
  }
  return trimmed
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
    if (!this.apiKey) {
      await this.logFailure('Missing EIA API key')
      return []
    }

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
      }

      if (startTime) {
        params.start = startTime.toISOString().slice(0, 10)
      }
      if (endTime) {
        params.end = endTime.toISOString().slice(0, 10)
      }

      const response = await eiaResilience.execute('getBalance', () =>
        axios.get<{ response: { data: EiaBalanceApiRecord[] } }>(
          `${this.baseUrl}/electricity/rto/region-data/data/`,
          { params, timeout: 12000 }
        )
      )

      await this.logSuccess()
      return (response.data.response.data || []).map((record) => ({
        period: normalizeEiaPeriod(record.period),
        respondent: record.respondent,
        'respondent-name': record['respondent-name'],
        type: record.type,
        value: Number(record.value),
        'value-units': record['value-units'],
      }))
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
    if (!this.apiKey) {
      await this.logFailure('Missing EIA API key')
      return []
    }

    try {
      const params: any = {
        api_key: this.apiKey,
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
        axios.get<{ response: { data: EiaInterchangeApiRecord[] } }>(
          `${this.baseUrl}/electricity/rto/interchange-data/data/`,
          { params, timeout: 12000 }
        )
      )

      await this.logSuccess()
      return (response.data.response.data || []).map((record) => ({
        period: normalizeEiaPeriod(record.period),
        'from-ba': record.fromba,
        'from-ba-name': record['fromba-name'],
        'to-ba': record.toba,
        'to-ba-name': record['toba-name'],
        type: 'ID',
        value: Number(record.value),
        'value-units': record['value-units'],
      }))
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
    if (!this.apiKey) {
      await this.logFailure('Missing EIA API key')
      return []
    }

    try {
      // The v2 subregion endpoint no longer supports the type facet required by the
      // legacy heuristic parser, so direct EIA fallback should not depend on it.
      await this.logSuccess()
      return []
    } catch (error: any) {
      console.error(`Failed to fetch EIA-930 subregion for ${balancingAuthority}:`, error.message)
      await this.logFailure(error.message ?? 'Failed to fetch subregion data')
      return []
    }
  }
}

export const eia930 = new EIA930Client()
