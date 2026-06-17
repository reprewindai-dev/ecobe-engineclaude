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
  DisclosureBatchResponse,
  DisclosureExportResponse,
  MethodologyProviders,
  MethodologyCard,
  PatternsResponse,
  OpportunityResult,
  BestWindowRequest,
  BestWindowResult,
  DekesIntegrationSummaryResponse,
  DekesIntegrationEventsResponse,
  DekesIntegrationMetricsResponse,
  DekesHandoff,
  GridHeroMetrics,
  GridSignalSummary,
  GridOpportunities,
  GridImportLeakage,
  DesignPartnerApplicationPayload,
  DesignPartnerApplicationResponse,
} from '@/types'

const API_BASE = process.env.NEXT_PUBLIC_ECOBE_API_URL || '/api/ecobe'

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000, // 30 s â€” prevents hung requests from blocking the UI
})

function isAxiosError(
  error: unknown
): error is {
  code?: string
  response?: {
    status: number
    data?: unknown
  }
} {
  return typeof error === 'object' && error !== null && 'isAxiosError' in error
}

type CompactDashboardSavings = {
  window?: '24h' | '7d' | '30d'
  totalDecisions?: number
  totalCO2SavedG?: number
  totalCO2BaselineG?: number
  totalCO2ActualG?: number
  savingsPct?: number
  savedEquivalents?: { kmDriven?: number; treeDays?: number; savedKg?: number }
  byRegion?: Array<{ region: string; decisions: number; co2SavedG: number; co2BaselineG: number; savingsPct: number }>
  trend?: Array<{ date: string; co2SavedG: number; co2BaselineG: number; decisions: number }>
  co2AvoidedKg?: number
  totalBaselineG?: number
  totalChosenG?: number
  totalAvoidedG?: number
  reductionPct?: number
  dailyTrend?: Array<{ date: string; baselineG: number; chosenG: number; avoidedG: number; decisions: number }>
}

function normalizeDashboardSavings(
  payload: DashboardSavings | CompactDashboardSavings
): DashboardSavings {
  if ('savingsPct' in payload && typeof payload.savingsPct === 'number') {
    return payload as DashboardSavings
  }

  const compact = payload as CompactDashboardSavings
  const window = compact.window ?? '30d'
  const windowHours = window === '24h' ? 24 : window === '7d' ? 168 : 720
  const totalCO2SavedG = compact.totalCO2SavedG ?? compact.totalAvoidedG ?? 0
  const totalCO2BaselineG = compact.totalCO2BaselineG ?? compact.totalBaselineG ?? 0
  const totalCO2ActualG = compact.totalCO2ActualG ?? compact.totalChosenG ?? 0
  const savingsPct =
    compact.savingsPct ??
    compact.reductionPct ??
    (totalCO2BaselineG > 0 ? (totalCO2SavedG / totalCO2BaselineG) * 100 : 0)

  return {
    window,
    windowHours,
    totalDecisions: compact.totalDecisions ?? 0,
    totalCO2SavedG,
    totalCO2BaselineG,
    totalCO2ActualG,
    savingsPct,
    savedEquivalents: {
      kmDriven: compact.savedEquivalents?.kmDriven ?? Math.round((compact.co2AvoidedKg ?? totalCO2SavedG / 1000) * 4.1),
      treeDays: compact.savedEquivalents?.treeDays ?? Math.round((compact.co2AvoidedKg ?? totalCO2SavedG / 1000) * 18),
      savedKg: compact.savedEquivalents?.savedKg ?? totalCO2SavedG / 1000,
    },
    byRegion: compact.byRegion ?? [],
    trend:
      compact.trend ??
      (compact.dailyTrend ?? []).map((entry) => ({
        date: entry.date,
        co2SavedG: entry.avoidedG,
        co2BaselineG: entry.baselineG,
        decisions: entry.decisions,
      })),
  }
}

// Normalize API errors into human-readable messages.
// Extracts error.message / error.detail from ECOBE response body when available.
api.interceptors.response.use(
  (res) => res,
  (err: unknown) => {
    if (isAxiosError(err)) {
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
        normalized.name = 'CO2RouterAPIError'
        return Promise.reject(normalized)
      }

      if (err.code === 'ECONNABORTED') {
        return Promise.reject(
          new Error('Request timed out â€” COâ‚‚Router Engine did not respond in time')
        )
      }

      if (!err.response) {
        return Promise.reject(
          new Error('Cannot reach COâ‚‚Router Engine â€” check NEXT_PUBLIC_ECOBE_API_URL')
        )
      }

      const status = err.response.status
      if (status === 404) return Promise.reject(new Error('Resource not found'))
      if (status === 401 || status === 403)
        return Promise.reject(new Error('Unauthorized â€” check API credentials'))
      if (status >= 500)
        return Promise.reject(new Error(`COâ‚‚Router Engine error (${status}) â€” check server logs`))
    }
    return Promise.reject(err)
  }
)

// â”€â”€â”€ Request Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  costIndexByRegion?: Record<string, number>
  carbonWeight?: number
  latencyWeight?: number
  costWeight?: number
  mode?: 'optimize' | 'assurance'
  policyMode?: 'default' | 'sec_disclosure_strict' | 'eu_24x7_ready'
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

// â”€â”€â”€ API Client â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const ecobeApi = {
  // â”€â”€ Energy â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async calculateEnergyEquation(request: EnergyEquationRequest): Promise<EnergyEquationResult> {
    const { data } = await api.post<EnergyEquationResult>('/energy/equation', request)
    return data
  },

  // â”€â”€ Routing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Returns GreenRoutingResult (200) or PolicyDelayResponse (202)
  async routeGreen(
    request: GreenRoutingRequest
  ): Promise<GreenRoutingResult | PolicyDelayResponse> {
    const response = await api.post<GreenRoutingResult | PolicyDelayResponse>('/route/green', request, {
      validateStatus: (s) => s === 200 || s === 202,
    })
    return response.data
  },

  async replayDecision(decisionFrameId: string): Promise<DecisionReplayResult> {
    const { data } = await api.get<DecisionReplayResult>(`/route/${decisionFrameId}/replay`)
    return data
  },

  // Revalidate a lease before executing a queued workload.
  // Returns execute (go), reroute (target changed), or delay (policy block).
  async revalidateLease(leaseId: string): Promise<RevalidateResponse> {
    const response = await api.post<RevalidateResponse>(`/route/${leaseId}/revalidate`, {}, {
      validateStatus: (s) => s === 200 || s === 202,
    })
    return response.data
  },

  // â”€â”€ Dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getDashboardMetrics(window: '24h' | '7d' = '24h'): Promise<DashboardMetrics> {
    try {
      const { data } = await api.get<DashboardMetrics>('/dashboard/metrics', { params: { window } })
      data.electricityMaps = data.electricityMaps ?? data.providerSignals ?? null
      return data
    } catch (error) {
      console.error('Failed to fetch dashboard metrics:', error)
      throw error
    }
  },

  async getDashboardSavings(window: '24h' | '7d' | '30d' = '24h'): Promise<DashboardSavings> {
    try {
      const { data } = await api.get<DashboardSavings | CompactDashboardSavings>('/dashboard/savings', {
        params: { window },
      })
      return normalizeDashboardSavings(data)
    } catch (error) {
      console.error('Failed to fetch dashboard savings:', error)
      throw error
    }
  },

  async getDecisions(limit = 100): Promise<{ decisions: DashboardDecision[] }> {
    try {
      const { data } = await api.get<{ decisions: DashboardDecision[] }>('/dashboard/decisions', { params: { limit } })
      return data
    } catch (error) {
      console.error('Failed to fetch decisions:', error)
      throw error
    }
  },

  async getCIRoutingHealth(): Promise<any> {
    const { data } = await api.get('/ci/health')
    return data
  },

  async getCIAvailableRegions(): Promise<any> {
    const { data } = await api.get('/ci/regions')
    return data
  },

  async getCIDecisions(limit = 20): Promise<{ decisions: any[] }> {
    const { data } = await api.get<{ decisions: any[] }>('/ci/decisions', {
      params: { limit },
    })
    return data
  },

  async getRegionMapping(): Promise<{ mappings: RegionMapping[] }> {
    try {
      const { data } = await api.get<{ mappings: RegionMapping[] }>('/dashboard/region-mapping')
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
      const { data } = await api.post<{ intensities: Array<{ zone: string; carbonIntensity: number }> }>(
        '/dashboard/what-if/intensities',
        { zones }
      )
      return data
    } catch (error) {
      console.error('Failed to fetch what-if intensities:', error)
      throw error
    }
  },

  // â”€â”€ Forecasting â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getRegionForecast(region: string, hoursAhead = 72): Promise<RegionForecast> {
    try {
      const { data } = await api.get<RegionForecast>(`/forecasting/${region}/forecasts`, {
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
      const { data } = await api.get<OptimalWindow>(`/forecasting/${region}/optimal-window`, {
        params: { durationHours, lookAheadHours },
      })
      return data
    } catch (error) {
      console.error('Failed to fetch optimal window:', error)
      throw error
    }
  },

  // â”€â”€ Provider Health â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getProviderHealth(): Promise<MethodologyProviders> {
    try {
      const { data } = await api.get<MethodologyProviders>('/dashboard/methodology/providers')
      return data
    } catch (error) {
      console.error('Failed to fetch provider health:', error)
      throw error
    }
  },

  async getMethodology(): Promise<MethodologyCard> {
    try {
      const { data } = await api.get<MethodologyCard>('/methodology')
      return data
    } catch (error) {
      console.error('Failed to fetch methodology:', error)
      throw error
    }
  },

  async getDisclosureExport(params?: {
    from?: string
    to?: string
    mode?: 'assurance' | 'optimize' | 'all'
    policyMode?: 'default' | 'sec_disclosure_strict' | 'eu_24x7_ready'
  }): Promise<DisclosureExportResponse> {
    try {
      const { data } = await api.get<DisclosureExportResponse>('/disclosure/export', {
        params: {
          format: 'json',
          ...params,
        },
      })
      return data
    } catch (error) {
      console.error('Failed to fetch disclosure export:', error)
      throw error
    }
  },

  async getDisclosureBatches(limit = 20): Promise<DisclosureBatchResponse> {
    try {
      const { data } = await api.get<DisclosureBatchResponse>('/disclosure/batches', { params: { limit } })
      return data
    } catch (error) {
      console.error('Failed to fetch disclosure batches:', error)
      throw error
    }
  },

  // â”€â”€ DEKES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    const { data } = await api.get<DekesAnalytics>('/dekes/analytics', { params })
    return data
  },

  // â”€â”€ Intelligence â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getIntelligencePatterns(regions: string[]): Promise<PatternsResponse> {
    const { data } = await api.get<PatternsResponse>('/intelligence/patterns', {
      params: { region: regions.join(',') },
    })
    return data
  },

  async predictOpportunity(region: string): Promise<OpportunityResult> {
    const { data } = await api.post<OpportunityResult>('/intelligence/predict-opportunity', { region })
    return data
  },

  async getBestWindow(request: BestWindowRequest): Promise<BestWindowResult> {
    const { data } = await api.post<BestWindowResult>('/intelligence/best-window', request)
    return data
  },

  // â”€â”€ Grid Intelligence â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getGridHeroMetrics(): Promise<GridHeroMetrics> {
    try {
      const { data } = await api.get<GridHeroMetrics>('/intelligence/grid/hero-metrics')
      return data
    } catch (error) {
      console.error('Failed to fetch grid hero metrics:', error)
      throw error
    }
  },

  async getGridSummary(regions?: string[]): Promise<GridSignalSummary> {
    try {
      const { data } = await api.get<GridSignalSummary>('/intelligence/grid/summary', {
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
      const { data } = await api.get<GridOpportunities>('/intelligence/grid/opportunities', {
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
      const { data } = await api.get<GridImportLeakage>('/intelligence/grid/import-leakage', {
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

  // â”€â”€ DEKES Integration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Read-only dashboard activation surfaces are built from a dashboard-side
  // read model derived from live ECOBE decisions and engine status.
  async getDekesIntegrationSummary(): Promise<DekesIntegrationSummaryResponse> {
    const { data } = await api.get<DekesIntegrationSummaryResponse>('/dekes/runtime', {
      params: { view: 'summary' },
    })
    return data
  },

  async getDekesIntegrationEvents(
    limit = 50
  ): Promise<DekesIntegrationEventsResponse> {
    const { data } = await api.get<DekesIntegrationEventsResponse>('/dekes/runtime', {
      params: { view: 'events', limit },
    })
    return data
  },

  async getDekesHandoffById(handoffId: string): Promise<DekesHandoff> {
    const { data } = await api.get<DekesHandoff>('/dekes/runtime', {
      params: { view: 'handoff', handoffId },
    })
    return data
  },

  async getDekesIntegrationMetrics(): Promise<DekesIntegrationMetricsResponse> {
    const { data } = await api.get<DekesIntegrationMetricsResponse>('/dekes/runtime', {
      params: { view: 'metrics' },
    })
    return data
  },


  // â”€â”€ Health â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async applyForDesignPartnerProgram(
    payload: DesignPartnerApplicationPayload
  ): Promise<DesignPartnerApplicationResponse> {
    const { data } = await api.post<DesignPartnerApplicationResponse>(
      '/design-partners/applications',
      payload
    )
    return data
  },

  async health() {
    const { data } = await api.get('/health')
    return data
  },
}

export default api
