import axios from 'axios'
import { env } from '../config/env'
import { recordIntegrationFailure, recordIntegrationSuccess } from './integration-metrics'

export interface CarbonIntensityData {
  zone: string
  carbonIntensity: number  // gCO2eq/kWh
  datetime: string
  fossilFuelPercentage?: number
  renewablePercentage?: number
  /**
   * ISO-8601 timestamp — when Electricity Maps generated this forecast.
   * Maps to ECOBE's referenceTime (two-time model).
   * Present on forecast responses (updatedAt); null on live readings.
   */
  updatedAt?: string
  /**
   * Native data granularity from the API ('hourly', 'half_hourly', 'quarter_hourly').
   * Used by the provider adapter to populate resolution_minutes on CarbonSignal.
   */
  temporalGranularity?: string
}

export class ElectricityMapsClient {
  private baseUrl: string
  private apiKey?: string

  constructor() {
    this.baseUrl = env.ELECTRICITY_MAPS_BASE_URL
    this.apiKey = env.ELECTRICITY_MAPS_API_KEY
  }

  private async logSuccess() {
    try {
      await recordIntegrationSuccess('ELECTRICITY_MAPS')
    } catch (error) {
      console.warn('Failed to record Electricity Maps success metric:', error)
    }
  }

  private async logFailure(message: string) {
    try {
      await recordIntegrationFailure('ELECTRICITY_MAPS', message)
    } catch (error) {
      console.warn('Failed to record Electricity Maps failure metric:', error)
    }
  }

  async getCarbonIntensity(zone: string): Promise<CarbonIntensityData | null> {
    if (!this.apiKey) {
      console.warn(`No Electricity Maps API key - using default ${env.DEFAULT_MAX_CARBON_G_PER_KWH} gCO2/kWh`)
      await this.logFailure('Missing Electricity Maps API key')
      return {
        zone,
        carbonIntensity: env.DEFAULT_MAX_CARBON_G_PER_KWH,
        datetime: new Date().toISOString(),
      }
    }

    try {
      const response = await axios.get(`${this.baseUrl}/v3/carbon-intensity/latest`, {
        params: { zone },
        headers: { 'auth-token': this.apiKey },
      })

      const data = response.data as any
      const result = {
        zone: data.zone,
        carbonIntensity: data.carbonIntensity,
        datetime: data.datetime,
        fossilFuelPercentage: data.fossilFuelPercentage,
        renewablePercentage: data.renewablePercentage,
      }
      await this.logSuccess()
      return result
    } catch (error: any) {
      console.error(`Failed to fetch carbon intensity for ${zone}:`, error.message)
      await this.logFailure(error.message ?? 'Unknown Electricity Maps error')
      return null
    }
  }

  async getCarbonIntensityHistory(
    zone: string,
    start: Date,
    end: Date
  ): Promise<CarbonIntensityData[]> {
    if (!this.apiKey) {
      await this.logFailure('Missing Electricity Maps API key')
      return []
    }

    try {
      const response = await axios.get(`${this.baseUrl}/v3/carbon-intensity/history`, {
        params: {
          zone,
          start: start.toISOString(),
          end: end.toISOString(),
        },
        headers: { 'auth-token': this.apiKey },
      })

      const history = (response.data as any).history.map((item: any) => ({
        zone: item.zone,
        carbonIntensity: item.carbonIntensity,
        datetime: item.datetime,
        fossilFuelPercentage: item.fossilFuelPercentage,
        renewablePercentage: item.renewablePercentage,
      }))
      await this.logSuccess()
      return history
    } catch (error: any) {
      console.error(`Failed to fetch carbon history for ${zone}:`, error.message)
      await this.logFailure(error.message ?? 'Unknown Electricity Maps history error')
      return []
    }
  }

  async getForecast(zone: string): Promise<CarbonIntensityData[]> {
    if (!this.apiKey) {
      await this.logFailure('Missing Electricity Maps API key')
      return []
    }

    try {
      const response = await axios.get(`${this.baseUrl}/v3/carbon-intensity/forecast`, {
        params: { zone },
        headers: { 'auth-token': this.apiKey },
      })

      const data = response.data as any
      // zone is a top-level field on the response, NOT on each forecast item.
      // updatedAt is the referenceTime — when EM generated this forecast run.
      // temporalGranularity tells us native resolution ('hourly', 'half_hourly', etc.)
      const topZone: string           = data.zone
      const updatedAt: string         = data.updatedAt
      const temporalGranularity: string = data.temporalGranularity ?? 'hourly'

      const forecast = (data.forecast as any[]).map((item) => ({
        zone:               topZone,
        carbonIntensity:    item.carbonIntensity,
        datetime:           item.datetime,
        updatedAt,
        temporalGranularity,
      }))
      await this.logSuccess()
      return forecast
    } catch (error: any) {
      console.error(`Failed to fetch forecast for ${zone}:`, error.message)
      await this.logFailure(error.message ?? 'Unknown Electricity Maps forecast error')
      return []
    }
  }
}

export const electricityMaps = new ElectricityMapsClient()
