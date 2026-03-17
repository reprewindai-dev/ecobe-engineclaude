import axios from 'axios'
import { env } from '../config/env'
import { recordIntegrationFailure, recordIntegrationSuccess } from './integration-metrics'
import { emberResilience } from './resilience'

export interface EmberCarbonIntensityData {
  entity_code: string
  entity_name: string
  date: string
  carbon_intensity: number
  unit: string
}

export interface EmberElectricityData {
  entity_code: string
  entity_name: string
  date: string
  value: number
  unit: string
  metric: string
}

export interface EmberCapacityData {
  entity_code: string
  entity_name: string
  date: string
  technology: string
  capacity_mw: number
}

export interface RegionStructuralProfile {
  region: string
  entityCode: string | null
  structuralCarbonBaseline: number | null
  carbonTrendDirection: 'up' | 'down' | 'flat' | null
  demandTrendTwh: number | null
  demandPerCapita: number | null
  fossilDependenceScore: number | null
  renewableDependenceScore: number | null
  generationMixProfile: Record<string, number> | null
  windCapacityGw: number | null
  solarCapacityGw: number | null
  windCapacityTrend: number | null
  solarCapacityTrend: number | null
  confidenceRole: 'validation' | 'historical_context'
  source: 'ember'
  updatedAt: string
}

export class EmberClient {
  private baseUrl: string
  private apiKey?: string

  constructor() {
    this.baseUrl = env.EMBER_BASE_URL
    this.apiKey = env.EMBER_API_KEY
  }

  private async logSuccess() {
    try {
      await recordIntegrationSuccess('EMBER')
    } catch (error) {
      console.warn('Failed to record Ember success metric:', error)
    }
  }

  private async logFailure(message: string) {
    try {
      await recordIntegrationFailure('EMBER', message)
    } catch (error) {
      console.warn('Failed to record Ember failure metric:', error)
    }
  }

  private getHeaders() {
    if (!this.apiKey) {
      return {}
    }
    return {
      'X-API-Key': this.apiKey,
    }
  }

  async getCarbonIntensityMonthly(entityCode: string, startDate?: string, endDate?: string): Promise<EmberCarbonIntensityData[]> {
    if (!this.apiKey) {
      await this.logFailure('Missing Ember API key')
      return []
    }

    try {
      const params: any = {
        entity_code: entityCode,
        temporal_resolution: 'monthly',
      }
      if (startDate) params.start_date = startDate
      if (endDate) params.end_date = endDate

      const response = await emberResilience.execute('getCarbonIntensityMonthly', () =>
        axios.get<{ data: EmberCarbonIntensityData[] }>(
          `${this.baseUrl}/v1/carbon-intensity/monthly`,
          {
            params,
            headers: this.getHeaders(),
            timeout: 15000,
          }
        )
      )

      await this.logSuccess()
      return response.data.data || []
    } catch (error: any) {
      console.error(`Failed to fetch Ember monthly carbon intensity for ${entityCode}:`, error.message)
      await this.logFailure(error.message ?? 'Failed to fetch carbon intensity')
      return []
    }
  }

  async getCarbonIntensityYearly(entityCode: string, startDate?: string, endDate?: string): Promise<EmberCarbonIntensityData[]> {
    if (!this.apiKey) {
      await this.logFailure('Missing Ember API key')
      return []
    }

    try {
      const params: any = {
        entity_code: entityCode,
        temporal_resolution: 'yearly',
      }
      if (startDate) params.start_date = startDate
      if (endDate) params.end_date = endDate

      const response = await emberResilience.execute('getCarbonIntensityYearly', () =>
        axios.get<{ data: EmberCarbonIntensityData[] }>(
          `${this.baseUrl}/v1/carbon-intensity/yearly`,
          {
            params,
            headers: this.getHeaders(),
            timeout: 15000,
          }
        )
      )

      await this.logSuccess()
      return response.data.data || []
    } catch (error: any) {
      console.error(`Failed to fetch Ember yearly carbon intensity for ${entityCode}:`, error.message)
      await this.logFailure(error.message ?? 'Failed to fetch carbon intensity')
      return []
    }
  }

  async getElectricityDemand(entityCode: string, resolution: 'monthly' | 'yearly', startDate?: string, endDate?: string): Promise<EmberElectricityData[]> {
    if (!this.apiKey) {
      await this.logFailure('Missing Ember API key')
      return []
    }

    try {
      const params: any = {
        entity_code: entityCode,
        temporal_resolution: resolution,
      }
      if (startDate) params.start_date = startDate
      if (endDate) params.end_date = endDate

      const response = await emberResilience.execute('getElectricityDemand', () =>
        axios.get<{ data: EmberElectricityData[] }>(
          `${this.baseUrl}/v1/electricity-demand/${resolution}`,
          {
            params,
            headers: this.getHeaders(),
            timeout: 15000,
          }
        )
      )

      await this.logSuccess()
      return response.data.data || []
    } catch (error: any) {
      console.error(`Failed to fetch Ember electricity demand for ${entityCode}:`, error.message)
      await this.logFailure(error.message ?? 'Failed to fetch electricity demand')
      return []
    }
  }

  async getElectricityGeneration(entityCode: string, resolution: 'monthly' | 'yearly', startDate?: string, endDate?: string): Promise<EmberElectricityData[]> {
    if (!this.apiKey) {
      await this.logFailure('Missing Ember API key')
      return []
    }

    try {
      const params: any = {
        entity_code: entityCode,
        temporal_resolution: resolution,
      }
      if (startDate) params.start_date = startDate
      if (endDate) params.end_date = endDate

      const response = await emberResilience.execute('getElectricityGeneration', () =>
        axios.get<{ data: EmberElectricityData[] }>(
          `${this.baseUrl}/v1/electricity-generation/${resolution}`,
          {
            params,
            headers: this.getHeaders(),
            timeout: 15000,
          }
        )
      )

      await this.logSuccess()
      return response.data.data || []
    } catch (error: any) {
      console.error(`Failed to fetch Ember electricity generation for ${entityCode}:`, error.message)
      await this.logFailure(error.message ?? 'Failed to fetch electricity generation')
      return []
    }
  }

  async getInstalledCapacity(entityCode: string, startDate?: string, endDate?: string): Promise<EmberCapacityData[]> {
    if (!this.apiKey) {
      await this.logFailure('Missing Ember API key')
      return []
    }

    try {
      const params: any = {
        entity_code: entityCode,
        temporal_resolution: 'monthly',
      }
      if (startDate) params.start_date = startDate
      if (endDate) params.end_date = endDate

      const response = await emberResilience.execute('getInstalledCapacity', () =>
        axios.get<{ data: EmberCapacityData[] }>(
          `${this.baseUrl}/v1/installed-capacity/monthly`,
          {
            params,
            headers: this.getHeaders(),
            timeout: 15000,
          }
        )
      )

      await this.logSuccess()
      return response.data.data || []
    } catch (error: any) {
      console.error(`Failed to fetch Ember installed capacity for ${entityCode}:`, error.message)
      await this.logFailure(error.message ?? 'Failed to fetch installed capacity')
      return []
    }
  }

  async deriveStructuralProfile(region: string, entityCode: string): Promise<RegionStructuralProfile> {
    const endDate = new Date().toISOString().split('T')[0]
    const startDate = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const [
      carbonIntensityMonthly,
      carbonIntensityYearly,
      demandMonthly,
      demandYearly,
      generationYearly,
      capacity,
    ] = await Promise.all([
      this.getCarbonIntensityMonthly(entityCode, startDate, endDate),
      this.getCarbonIntensityYearly(entityCode, startDate, endDate),
      this.getElectricityDemand(entityCode, 'monthly', startDate, endDate),
      this.getElectricityDemand(entityCode, 'yearly', startDate, endDate),
      this.getElectricityGeneration(entityCode, 'yearly', startDate, endDate),
      this.getInstalledCapacity(entityCode, startDate, endDate),
    ])

    // Calculate structural baseline (average of last year)
    const recentCarbon = carbonIntensityMonthly.slice(-12)
    const structuralCarbonBaseline = recentCarbon.length > 0
      ? recentCarbon.reduce((sum, d) => sum + d.carbon_intensity, 0) / recentCarbon.length
      : null

    // Calculate carbon trend
    let carbonTrendDirection: 'up' | 'down' | 'flat' | null = null
    if (carbonIntensityYearly.length >= 2) {
      const recent = carbonIntensityYearly[carbonIntensityYearly.length - 1].carbon_intensity
      const previous = carbonIntensityYearly[carbonIntensityYearly.length - 2].carbon_intensity
      const change = (recent - previous) / previous
      carbonTrendDirection = change > 0.05 ? 'up' : change < -0.05 ? 'down' : 'flat'
    }

    // Calculate demand metrics
    const latestDemand = demandYearly[demandYearly.length - 1]
    const demandTrendTwh = latestDemand?.value ?? null
    const demandPerCapita = null // Would need population data

    // Calculate generation mix
    const latestGeneration = generationYearly.filter(g => g.date === latestDemand?.date)
    const generationMixProfile: Record<string, number> = {}
    let totalGeneration = 0
    
    for (const gen of latestGeneration) {
      if (gen.metric && gen.value) {
        generationMixProfile[gen.metric] = gen.value
        totalGeneration += gen.value
      }
    }

    // Calculate fossil/renewable dependence
    const fossilTypes = ['coal', 'gas', 'oil']
    const renewableTypes = ['wind', 'solar', 'hydro', 'nuclear']
    
    let fossilGeneration = 0
    let renewableGeneration = 0
    
    for (const [type, value] of Object.entries(generationMixProfile)) {
      if (fossilTypes.some(f => type.toLowerCase().includes(f))) {
        fossilGeneration += value
      }
      if (renewableTypes.some(r => type.toLowerCase().includes(r))) {
        renewableGeneration += value
      }
    }

    const fossilDependenceScore = totalGeneration > 0 ? fossilGeneration / totalGeneration : null
    const renewableDependenceScore = totalGeneration > 0 ? renewableGeneration / totalGeneration : null

    // Calculate capacity metrics
    const windCapacity = capacity.filter(c => c.technology?.toLowerCase().includes('wind'))
    const solarCapacity = capacity.filter(c => c.technology?.toLowerCase().includes('solar'))
    
    const latestWindCapacity = windCapacity[windCapacity.length - 1]
    const latestSolarCapacity = solarCapacity[solarCapacity.length - 1]
    
    const windCapacityGw = latestWindCapacity ? latestWindCapacity.capacity_mw / 1000 : null
    const solarCapacityGw = latestSolarCapacity ? latestSolarCapacity.capacity_mw / 1000 : null

    // Calculate capacity trends
    let windCapacityTrend = null
    let solarCapacityTrend = null
    
    if (windCapacity.length >= 2) {
      const recent = windCapacity[windCapacity.length - 1].capacity_mw
      const yearAgo = windCapacity[windCapacity.length - 13]?.capacity_mw
      if (yearAgo) {
        windCapacityTrend = (recent - yearAgo) / yearAgo
      }
    }
    
    if (solarCapacity.length >= 2) {
      const recent = solarCapacity[solarCapacity.length - 1].capacity_mw
      const yearAgo = solarCapacity[solarCapacity.length - 13]?.capacity_mw
      if (yearAgo) {
        solarCapacityTrend = (recent - yearAgo) / yearAgo
      }
    }

    return {
      region,
      entityCode,
      structuralCarbonBaseline,
      carbonTrendDirection,
      demandTrendTwh,
      demandPerCapita,
      fossilDependenceScore,
      renewableDependenceScore,
      generationMixProfile: Object.keys(generationMixProfile).length > 0 ? generationMixProfile : null,
      windCapacityGw,
      solarCapacityGw,
      windCapacityTrend,
      solarCapacityTrend,
      confidenceRole: 'validation',
      source: 'ember',
      updatedAt: new Date().toISOString(),
    }
  }
}

export const ember = new EmberClient()
