import axios from 'axios'
import type {
  EnergyEquationResult,
  GreenRoutingResult,
  PolicyDelayResponse,
  RevalidateResponse,
  DekesAnalytics,
  DashboardMetrics,
  DashboardSavings,
  DashboardDecision,
  RegionMapping,
  RegionForecast,
  OptimalWindow,
  DecisionReplayResult,
  MethodologyProviders,
  PatternsResponse,
  OpportunityResult,
  BestWindowRequest,
  BestWindowResult,
  DekesIntegrationSummary,
  DekesHandoff,
  DekesOrgRisk,
  GridHeroMetrics,
  GridSignalSummary,
  GridOpportunities,
  GridImportLeakage,
} from '@/types'

const API_BASE = process.env.NEXT_PUBLIC_ECOBE_API_URL || '/api/ecobe'

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000, // 30 s — prevents hung requests from blocking the UI
})

// Normalize API errors into human-readable messages.
// Extracts error.message / error.detail from ECOBE response body when available.
api.interceptors.response.use(
  (res) => res,
  (err: unknown) => {
    if (axios.isAxiosError(err)) {
      const body = err.response?.data as Record<string, unknown> | undefined
      const serverMsg =
        typeof body?.message === 'string'
          ? body.message
          : typeof body?.error === 'string'
            ? body.error
            : typeof body?.detail === 'string'
              ? body.detail
              : null

      if (serverMsg) {
        const normalized = new Error(serverMsg)
        normalized.name = 'EcobeAPIError'
        return Promise.reject(normalized)
      }

      if (err.code === 'ECONNABORTED') {
        return Promise.reject(
          new Error('Request timed out — ECOBE Engine did not respond in time')
        )
      }

      if (!err.response) {
        return Promise.reject(
          new Error('Cannot reach ECOBE Engine — check NEXT_PUBLIC_ECOBE_API_URL')
        )
      }

      const status = err.response.status
      if (status === 404) return Promise.reject(new Error('Resource not found'))
      if (status === 401 || status === 403)
        return Promise.reject(new Error('Unauthorized — check API credentials'))
      if (status >= 500)
        return Promise.reject(new Error(`ECOBE Engine error (${status}) — check server logs`))
    }
    return Promise.reject(err)
  }
)

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

  // Revalidate a lease before executing a queued workload.
  // Returns execute (go), reroute (target changed), or delay (policy block).
  async revalidateLease(leaseId: string): Promise<RevalidateResponse> {
    const response = await api.post(`/route/${leaseId}/revalidate`, {}, {
      validateStatus: (s) => s === 200 || s === 202,
    })
    return response.data
  },

  // ── Dashboard ────────────────────────────────────────────────────────────────
  async getDashboardMetrics(window: '24h' | '7d' = '24h'): Promise<DashboardMetrics> {
    try {
      const { data } = await api.get('/dashboard/metrics', { params: { window } })
      return data
    } catch (error) {
      console.error('Failed to fetch dashboard metrics:', error)
      throw error
    }
  },

  async getDashboardSavings(window: '24h' | '7d' | '30d' = '24h'): Promise<DashboardSavings> {
    try {
      const { data } = await api.get('/dashboard/savings', { params: { window } })
      return data
    } catch (error) {
      console.error('Failed to fetch dashboard savings:', error)
      throw error
    }
  },

  async getDecisions(limit = 100): Promise<{ decisions: DashboardDecision[] }> {
    try {
      const { data } = await api.get('/dashboard/decisions', { params: { limit } })
      return data
    } catch (error) {
      console.error('Failed to fetch decisions:', error)
      throw error
    }
  },

  async getRegionMapping(): Promise<{ mappings: RegionMapping[] }> {
    try {
      const { data } = await api.get('/dashboard/region-mapping')
      return data
    } catch (error) {
      console.error('Failed to fetch region mapping:', error)
      throw error
    }
  },

  async getWhatIfIntensities(
    zones: string[]
  ): Promise<{ intensities: Array<{ zone: string; carbonIntensity: number }> }> {
    try {
      const { data } = await api.post('/dashboard/what-if/intensities', { zones })
      return data
    } catch (error) {
      console.error('Failed to fetch what-if intensities:', error)
      throw error
    }
  },

  // ── Forecasting ──────────────────────────────────────────────────────────────
  async getRegionForecast(region: string, hoursAhead = 72): Promise<RegionForecast> {
    try {
      const { data } = await api.get(`/forecasting/${region}/forecasts`, {
        params: { hoursAhead },
      })
      return data
    } catch (error) {
      console.error('Failed to fetch region forecast:', error)
      throw error
    }
  },

  async getOptimalWindow(
    region: string,
    durationHours = 4,
    lookAheadHours = 48
  ): Promise<OptimalWindow> {
    try {
      const { data } = await api.get(`/forecasting/${region}/optimal-window`, {
        params: { durationHours, lookAheadHours },
      })
      return data
    } catch (error) {
      console.error('Failed to fetch optimal window:', error)
      throw error
    }
  },

  // ── Provider Health ───────────────────────────────────────────────────────────
  async getProviderHealth(): Promise<MethodologyProviders> {
    try {
      const { data } = await api.get('/methodology/providers')
      return data
    } catch (error) {
      console.error('Failed to fetch provider health:', error)
      throw error
    }
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

  // ── Intelligence ──────────────────────────────────────────────────────────────
  async getIntelligencePatterns(regions: string[]): Promise<PatternsResponse> {
    const { data } = await api.get('/intelligence/patterns', {
      params: { region: regions.join(',') },
    })
    return data
  },

  async predictOpportunity(region: string): Promise<OpportunityResult> {
    const { data } = await api.post('/intelligence/predict-opportunity', { region })
    return data
  },

  async getBestWindow(request: BestWindowRequest): Promise<BestWindowResult> {
    const { data } = await api.post('/intelligence/best-window', request)
    return data
  },

  // ── Grid Intelligence ───────────────────────────────────────────────────────────
  async getGridHeroMetrics(): Promise<GridHeroMetrics> {
    try {
      const { data } = await api.get('/intelligence/grid/hero-metrics')
      return data
    } catch (error) {
      console.error('Failed to fetch grid hero metrics:', error)
      throw error
    }
  },

  async getGridSummary(regions?: string[]): Promise<GridSignalSummary> {
    try {
      const { data } = await api.get('/intelligence/grid/summary', {
        params: regions ? { regions } : undefined,
      })
      return data
    } catch (error) {
      console.error('Failed to fetch grid summary:', error)
      throw error
    }
  },

  async getGridOpportunities(regions?: string[]): Promise<GridOpportunities> {
    try {
      const { data } = await api.get('/intelligence/grid/opportunities', {
        params: regions ? { regions } : undefined,
      })
      return data
    } catch (error) {
      console.error('Failed to fetch grid opportunities:', error)
      throw error
    }
  },

  async getGridRegionDetail(region: string, hours = 24): Promise<any> {
    try {
      const { data } = await api.get(`/intelligence/grid/region/${encodeURIComponent(region)}`, {
        params: { hours },
      })
      return data
    } catch (error) {
      console.error('Failed to fetch grid region detail:', error)
      throw error
    }
  },

  async getGridImportLeakage(regions?: string[]): Promise<GridImportLeakage> {
    try {
      const { data } = await api.get('/intelligence/grid/import-leakage', {
        params: regions ? { regions } : undefined,
      })
      return data
    } catch (error) {
      console.error('Failed to fetch grid import leakage:', error)
      throw error
    }
  },

  async getGridAudit(region: string, hours = 24): Promise<any> {
    try {
      const { data } = await api.get(`/intelligence/grid/audit/${encodeURIComponent(region)}`, {
        params: { hours },
      })
      return data
    } catch (error) {
      console.error('Failed to fetch grid audit:', error)
      throw error
    }
  },

  // ── DEKES Integration ─────────────────────────────────────────────────────────
  // Read-only — handoffs are emitted by the ECOBE engine, never by the dashboard.
  // All routes resolve through the existing /api/ecobe proxy → ECOBE engine.
  async getDekesIntegrationSummary(): Promise<DekesIntegrationSummary> {
    const { data } = await api.get('/integrations/dekes/summary')
    return data
  },

  async getDekesIntegrationEvents(
    limit = 50
  ): Promise<{ handoffs: DekesHandoff[] }> {
    const { data } = await api.get('/integrations/dekes/events', {
      params: { limit },
    })
    return data
  },

  async getDekesHandoffById(handoffId: string): Promise<DekesHandoff> {
    const { data } = await api.get(`/integrations/dekes/events/${encodeURIComponent(handoffId)}`)
    return data
  },

  async getDekesIntegrationMetrics(): Promise<{ orgRisks: DekesOrgRisk[] }> {
    const { data } = await api.get('/integrations/dekes/metrics')
    return data
  },

  // ── Health ────────────────────────────────────────────────────────────────────
  async health() {
    const { data } = await api.get('/health')
    return data
  },
}

export default api
