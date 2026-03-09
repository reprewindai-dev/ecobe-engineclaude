import axios from 'axios'
import type {
  EnergyEquationResult,
  GreenRoutingResult,
  PolicyDelayResponse,
  DekesAnalytics,
  DashboardMetrics,
  DashboardSavings,
  DashboardDecision,
  RegionMapping,
  RegionForecast,
  OptimalWindow,
  DecisionReplayResult,
  MethodologyProviders,
} from '@/types'

const API_BASE = process.env.NEXT_PUBLIC_ECOBE_API_URL || '/api/ecobe'

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
})

// ─── Request Types ────────────────────────────────────────────────────────────

export interface EnergyEquationRequest {
  requestVolume: number
  workloadType: 'inference' | 'training' | 'batch'
  modelSize?: string
  regionTargets: string[]
  carbonBudget?: number
  deadlineWindow?: { start: string; end: string }
  hardwareMix?: { cpu: number; gpu: number; tpu: number }
}

export interface GreenRoutingRequest {
  preferredRegions: string[]
  maxCarbonGPerKwh?: number
  latencyMsByRegion?: Record<string, number>
  carbonWeight?: number
  latencyWeight?: number
  costWeight?: number
  targetTime?: string
  durationMinutes?: number
}

export interface DekesOptimizeRequest {
  query: { id: string; query: string; estimatedResults: number }
  carbonBudget: number
  regions: string[]
}

export interface DekesScheduleRequest {
  queries: Array<{ id: string; query: string; estimatedResults: number }>
  regions: string[]
  lookAheadHours?: number
}

// ─── API Client ───────────────────────────────────────────────────────────────

export const ecobeApi = {
  // ── Energy ──────────────────────────────────────────────────────────────────
  async calculateEnergyEquation(request: EnergyEquationRequest): Promise<EnergyEquationResult> {
    const { data } = await api.post('/energy/equation', request)
    return data
  },

  // ── Routing ──────────────────────────────────────────────────────────────────
  // Returns GreenRoutingResult (200) or PolicyDelayResponse (202)
  async routeGreen(
    request: GreenRoutingRequest
  ): Promise<GreenRoutingResult | PolicyDelayResponse> {
    const response = await api.post('/route/green', request, {
      validateStatus: (s) => s === 200 || s === 202,
    })
    return response.data
  },

  async replayDecision(decisionFrameId: string): Promise<DecisionReplayResult> {
    const { data } = await api.get(`/route/${decisionFrameId}/replay`)
    return data
  },

  // ── Dashboard ────────────────────────────────────────────────────────────────
  async getDashboardMetrics(window: '24h' | '7d' = '24h'): Promise<DashboardMetrics> {
    const { data } = await api.get('/dashboard/metrics', { params: { window } })
    return data
  },

  async getDashboardSavings(window: '24h' | '7d' | '30d' = '24h'): Promise<DashboardSavings> {
    const { data } = await api.get('/dashboard/savings', { params: { window } })
    return data
  },

  async getDecisions(limit = 100): Promise<{ decisions: DashboardDecision[] }> {
    const { data } = await api.get('/dashboard/decisions', { params: { limit } })
    return data
  },

  async getRegionMapping(): Promise<{ mappings: RegionMapping[] }> {
    const { data } = await api.get('/dashboard/region-mapping')
    return data
  },

  async getWhatIfIntensities(
    zones: string[]
  ): Promise<{ intensities: Array<{ zone: string; carbonIntensity: number }> }> {
    const { data } = await api.post('/dashboard/what-if/intensities', { zones })
    return data
  },

  // ── Forecasting ──────────────────────────────────────────────────────────────
  async getRegionForecast(region: string, hoursAhead = 72): Promise<RegionForecast> {
    const { data } = await api.get(`/forecasting/${region}/forecasts`, {
      params: { hoursAhead },
    })
    return data
  },

  async getOptimalWindow(
    region: string,
    durationHours = 4,
    lookAheadHours = 48
  ): Promise<OptimalWindow> {
    const { data } = await api.get(`/forecasting/${region}/optimal-window`, {
      params: { durationHours, lookAheadHours },
    })
    return data
  },

  // ── Provider Health ───────────────────────────────────────────────────────────
  async getProviderHealth(): Promise<MethodologyProviders> {
    const { data } = await api.get('/methodology/providers')
    return data
  },

  // ── DEKES ─────────────────────────────────────────────────────────────────────
  async optimizeDekesQuery(request: DekesOptimizeRequest) {
    const { data } = await api.post('/dekes/optimize', request)
    return data
  },

  async scheduleDekesQueries(request: DekesScheduleRequest) {
    const { data } = await api.post('/dekes/schedule', request)
    return data
  },

  async getDekesAnalytics(params?: {
    dekesQueryId?: string
    startDate?: string
    endDate?: string
  }): Promise<DekesAnalytics> {
    const { data } = await api.get('/dekes/analytics', { params })
    return data
  },

  // ── Health ────────────────────────────────────────────────────────────────────
  async health() {
    const { data } = await api.get('/health')
    return data
  },
}

export default api
