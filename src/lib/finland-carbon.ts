import axios from 'axios'
import { recordIntegrationFailure, recordIntegrationSuccess } from './integration-metrics'

/**
 * Finland Carbon Intensity - Fingrid Open Data
 *
 * Source: https://data.fingrid.fi/api
 * Coverage: Finland (national)
 * Auth: API key via x-api-key header (free registration)
 * Cadence: Every 3 minutes
 * Cost: $0
 *
 * Dataset IDs:
 *   265 = Emission factor of electricity consumed in Finland (gCO2/kWh)
 *   266 = Emission factor of electricity produced in Finland (gCO2/kWh)
 */

export interface FICarbonData {
  zone: 'FI'
  carbonIntensity: number
  timestamp: string
  isForecast: boolean
  method: 'consumed' | 'produced'
}

type FingridTimeseriesRow = {
  datasetId?: number
  startTime?: string
  endTime?: string
  value?: number | string
}

const BASE_URL = 'https://data.fingrid.fi/api'
const CONSUMED_DATASET_ID = 265
const PRODUCED_DATASET_ID = 266
const MAX_STALENESS_MS = 30 * 60 * 1000

function numeric(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isFreshEnough(timestamp: string): boolean {
  const parsed = new Date(timestamp).getTime()
  return Number.isFinite(parsed) && Date.now() - parsed <= MAX_STALENESS_MS
}

export class FinlandCarbonClient {
  private apiKey?: string

  constructor() {
    this.apiKey = process.env.FINGRID_API_KEY
  }

  private async logSuccess() {
    try { await recordIntegrationSuccess('FI_CARBON' as any) } catch { /* ignore */ }
  }

  private async logFailure(message: string) {
    try { await recordIntegrationFailure('FI_CARBON' as any, message) } catch { /* ignore */ }
  }

  get isAvailable(): boolean {
    return Boolean(this.apiKey)
  }

  private headers() {
    return { 'x-api-key': this.apiKey as string }
  }

  private normalizeRow(
    row: FingridTimeseriesRow | null | undefined,
    method: 'consumed' | 'produced'
  ): FICarbonData | null {
    const timestamp = String(row?.startTime ?? row?.endTime ?? '')
    const carbonIntensity = numeric(row?.value)

    if (!timestamp || carbonIntensity == null || carbonIntensity <= 0) return null
    if (!isFreshEnough(timestamp)) return null

    return {
      zone: 'FI',
      carbonIntensity: Math.round(carbonIntensity),
      timestamp,
      isForecast: false,
      method,
    }
  }

  private async getLatestDatasetValue(
    datasetId: number,
    method: 'consumed' | 'produced'
  ): Promise<FICarbonData | null> {
    const response = await axios.get<FingridTimeseriesRow>(
      `${BASE_URL}/datasets/${datasetId}/data/latest`,
      {
        headers: this.headers(),
        timeout: 10000,
      }
    )

    return this.normalizeRow(response.data, method)
  }

  private async getWindowedDatasetValue(
    datasetId: number,
    method: 'consumed' | 'produced'
  ): Promise<FICarbonData | null> {
    const now = new Date()
    const start = new Date(now.getTime() - 60 * 60 * 1000)

    const response = await axios.get<{ data?: FingridTimeseriesRow[] }>(
      `${BASE_URL}/datasets/${datasetId}/data`,
      {
        params: {
          startTime: start.toISOString(),
          endTime: now.toISOString(),
          format: 'json',
          pageSize: 1,
          sortBy: 'startTime',
          sortOrder: 'desc',
        },
        headers: this.headers(),
        timeout: 10000,
      }
    )

    return this.normalizeRow(response.data?.data?.[0], method)
  }

  async getCurrentIntensity(): Promise<FICarbonData | null> {
    if (!this.apiKey) {
      await this.logFailure('Missing FINGRID_API_KEY')
      return null
    }

    try {
      const latest =
        (await this.getLatestDatasetValue(CONSUMED_DATASET_ID, 'consumed')) ??
        (await this.getWindowedDatasetValue(CONSUMED_DATASET_ID, 'consumed'))

      if (!latest) {
        await this.logFailure('Fingrid consumed emission factor returned no fresh current value')
        return null
      }

      await this.logSuccess()
      return latest
    } catch (error: any) {
      console.error('Finland CO2 intensity fetch failed:', error.message)
      await this.logFailure(error.message)
      return null
    }
  }

  async getProductionIntensity(): Promise<FICarbonData | null> {
    if (!this.apiKey) return null

    try {
      const latest =
        (await this.getLatestDatasetValue(PRODUCED_DATASET_ID, 'produced')) ??
        (await this.getWindowedDatasetValue(PRODUCED_DATASET_ID, 'produced'))

      if (!latest) {
        await this.logFailure('Fingrid produced emission factor returned no fresh current value')
        return null
      }

      await this.logSuccess()
      return latest
    } catch (error: any) {
      console.error('Finland CO2 production intensity fetch failed:', error.message)
      await this.logFailure(error.message)
      return null
    }
  }
}

export const finlandCarbon = new FinlandCarbonClient()
