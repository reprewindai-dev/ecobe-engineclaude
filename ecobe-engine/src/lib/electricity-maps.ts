import axios from 'axios'
import { env } from '../config/env'

export interface CarbonIntensityData {
  zone: string
  carbonIntensity: number  // gCO2eq/kWh
  datetime: string
  fossilFuelPercentage?: number
  renewablePercentage?: number
}

export class ElectricityMapsClient {
  private baseUrl: string
  private apiKey?: string

  constructor() {
    this.baseUrl = env.ELECTRICITY_MAPS_BASE_URL
    this.apiKey = env.ELECTRICITY_MAPS_API_KEY
  }

  async getCarbonIntensity(zone: string): Promise<CarbonIntensityData | null> {
    if (!this.apiKey) {
      console.warn(`No Electricity Maps API key - using default ${env.DEFAULT_MAX_CARBON_G_PER_KWH} gCO2/kWh`)
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

      return {
        zone: response.data.zone,
        carbonIntensity: response.data.carbonIntensity,
        datetime: response.data.datetime,
        fossilFuelPercentage: response.data.fossilFuelPercentage,
        renewablePercentage: response.data.renewablePercentage,
      }
    } catch (error: any) {
      console.error(`Failed to fetch carbon intensity for ${zone}:`, error.message)
      return null
    }
  }

  async getCarbonIntensityHistory(
    zone: string,
    start: Date,
    end: Date
  ): Promise<CarbonIntensityData[]> {
    if (!this.apiKey) {
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

      return response.data.history.map((item: any) => ({
        zone: item.zone,
        carbonIntensity: item.carbonIntensity,
        datetime: item.datetime,
        fossilFuelPercentage: item.fossilFuelPercentage,
        renewablePercentage: item.renewablePercentage,
      }))
    } catch (error: any) {
      console.error(`Failed to fetch carbon history for ${zone}:`, error.message)
      return []
    }
  }

  async getForecast(zone: string): Promise<CarbonIntensityData[]> {
    if (!this.apiKey) {
      return []
    }

    try {
      const response = await axios.get(`${this.baseUrl}/v3/carbon-intensity/forecast`, {
        params: { zone },
        headers: { 'auth-token': this.apiKey },
      })

      return response.data.forecast.map((item: any) => ({
        zone: item.zone,
        carbonIntensity: item.carbonIntensity,
        datetime: item.datetime,
      }))
    } catch (error: any) {
      console.error(`Failed to fetch forecast for ${zone}:`, error.message)
      return []
    }
  }
}

export const electricityMaps = new ElectricityMapsClient()
