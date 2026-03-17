// ─── Region / Carbon ─────────────────────────────────────────────────────────

export interface Region {
  code: string
  name: string
  country: string
  timezone: string
}

export interface CarbonIntensity {
  region: string
  carbonIntensity: number
  timestamp: string
  source?: string
}

// ─── Quality & Stability Enums ────────────────────────────────────────────────

export type QualityTier = 'high' | 'medium' | 'low'
export type ForecastStability = 'stable' | 'medium' | 'unstable'

// ─── Routing ──────────────────────────────────────────────────────────────────

export interface RoutingRecommendation {
  region: string
  rank: number
  carbonIntensity: number
  estimatedCO2: number
  estimatedEnergyKwh: number
  score: number
  estimatedLatency?: number
}

export interface PredictedCleanWindow {
  region: string
  current_intensity: number
  predicted_intensity: number
  drop_pct: number
  drop_probability: number // 0–1
  expected_minutes: number
  reliability_tier: 'high' | 'medium' | 'low' | 'unknown'
}

export interface GreenRoutingResult {
  selectedRegion: string
  carbonIntensity: number
  estimatedLatency?: number
  score: number
  qualityTier: QualityTier
  explanation: string
  carbon_delta_g_per_kwh: number
  forecast_stability: ForecastStability | null
  provider_disagreement: { flag: boolean; pct: number | null } | null
  alternatives: Array<{
    region: string
    carbonIntensity: number
    score: number
    reason?: string
  }>
  decisionFrameId?: string
  forecastAvailable?: boolean
  confidenceBand?: { low: number; mid: number; high: number; empirical: boolean }
  dataResolutionMinutes?: number
  predicted_clean_window?: PredictedCleanWindow | null
  // Grid signal fields
  balancingAuthority?: string | null
  demandRampPct?: number | null
  carbonSpikeProbability?: number | null
  curtailmentProbability?: number | null
  importCarbonLeakageScore?: number | null
  // Data quality flags
  estimatedFlag?: boolean | null
  syntheticFlag?: boolean | null
  source_used?: string | null
  validation_source?: string | null
  fallback_used?: boolean | null
  // Lease fields — present when the engine issues a time-bounded routing token
  lease_id?: string
  lease_expires_at?: string          // ISO-8601 — hard expiry of the routing decision
  must_revalidate_after?: string     // ISO-8601 — soft checkpoint before execution
}

// Revalidation response from POST /api/v1/route/{lease_id}/revalidate
export type RevalidateResponse =
  | {
      action: 'execute'
      selectedRegion: string
      carbonIntensity: number
      lease_id: string
    }
  | {
      action: 'reroute'
      selectedRegion: string
      carbonIntensity: number
      lease_id: string
      previousRegion: string
      reason: string
    }
  | {
      action: 'delay'
      retryAfterMinutes: number
      message: string
      currentBest: { region: string; carbonIntensity: number }
    }

export interface PolicyDelayResponse {
  action: 'delay'
  reason: 'carbon_policy_violation'
  policy: { maxCarbonGPerKwh: number; requireGreenRouting: boolean }
  currentBest: { region: string; carbonIntensity: number }
  retryAfterMinutes: number
  message: string
}

// ─── Energy ───────────────────────────────────────────────────────────────────

export interface EnergyEquationResult {
  routingRecommendation: RoutingRecommendation[]
  regionEstimates: RoutingRecommendation[]
  totalEstimatedCO2: number
  withinBudget: boolean
}

// ─── Dashboard Decision Log ───────────────────────────────────────────────────

export interface DashboardDecision {
  id: string
  createdAt: string
  organizationId: string | null
  workloadName: string | null
  opName: string | null
  baselineRegion: string
  chosenRegion: string
  zoneBaseline: string | null
  zoneChosen: string | null
  carbonIntensityBaselineGPerKwh: number | null
  carbonIntensityChosenGPerKwh: number | null
  estimatedKwh: number | null
  co2BaselineG: number | null
  co2ChosenG: number | null
  reason: string | null
  latencyEstimateMs: number | null
  latencyActualMs: number | null
  fallbackUsed: boolean
  dataFreshnessSeconds: number | null
  requestCount: number
  meta: Record<string, unknown>
}

// ─── Dashboard Metrics ────────────────────────────────────────────────────────

export interface ExecutionIntegrity {
  driftPreventedPct: number        // % of revalidations where routing held
  revalidationsTriggered: number   // total revalidate calls
  reroutedCount: number            // action: 'reroute' outcomes
  delayedCount: number             // action: 'delay' outcomes
  stalenessViolations: number      // executions attempted after lease_expires_at
}

export interface DashboardMetrics {
  window: '24h' | '7d'
  windowHours: number
  totalDecisions: number
  totalRequests: number
  co2SavedG: number
  co2AvoidedPer1kRequestsG: number
  greenRouteRate: number
  fallbackRate: number
  topChosenRegion: string | null
  p95LatencyDeltaMs: number | null
  dataFreshnessMaxSeconds: number | null
  electricityMapsSuccessRate: number | null
  electricityMaps: {
    successRate: number | null
    successCount: number
    failureCount: number
    lastSuccessAt: string | null
    lastFailureAt: string | null
    lastError: string | null
  } | null
  forecastRefresh: {
    lastRun: {
      timestamp: string
      totalRegions: number
      totalRecords: number
      totalForecasts: number
      status: string
      message: string | null
    } | null
  } | null
  executionIntegrity?: ExecutionIntegrity | null
}

// ─── Dashboard Savings ────────────────────────────────────────────────────────

export interface DashboardSavings {
  window: '24h' | '7d' | '30d'
  windowHours: number
  totalDecisions: number
  totalCO2SavedG: number
  totalCO2BaselineG: number
  totalCO2ActualG: number
  savingsPct: number
  savedEquivalents: {
    kmDriven: number
    treeDays: number
    savedKg: number
  }
  byRegion: Array<{
    region: string
    decisions: number
    co2SavedG: number
    co2BaselineG: number
    savingsPct: number
  }>
  trend: Array<{
    date: string
    co2SavedG: number
    co2BaselineG: number
    decisions: number
  }>
}

// ─── Region Mapping ───────────────────────────────────────────────────────────

export interface RegionMapping {
  cloudRegion: string
  zone: string
  lastSeenAt: string
  carbonIntensityGPerKwh: number | null
  fetchedAt: string | null
}

// ─── Forecasting ──────────────────────────────────────────────────────────────

export interface ForecastPoint {
  forecastTime: string
  predictedIntensity: number
  confidence?: number
}

export interface RegionForecast {
  region: string
  hoursAhead: number
  forecasts: ForecastPoint[]
}

export interface OptimalWindow {
  region: string
  durationHours: number
  lookAheadHours: number
  window: {
    startTime: string
    endTime: string
    avgIntensity: number
    minIntensity: number
    confidence: number
  } | null
}

// ─── Decision Replay ──────────────────────────────────────────────────────────

export interface DecisionReplayResult {
  decisionFrameId: string
  replayedAt: string
  createdAt: string
  // Workload context — present when the original decision was attributed to a named source
  organizationId?: string | null
  workloadType?: string | null
  source?: string | null
  request: {
    regions: string[]
    targetTime: string | null
    durationMinutes: number | null
    maxCarbonGPerKwh: number | null
    weights: { carbon: number; latency: number; cost: number }
  }
  signals: Record<
    string,
    {
      intensity: number
      source: string
      fallbackUsed: boolean
      disagreementFlag: boolean
    }
  >
  selectedRegion: string
  carbonIntensity: number
  baselineIntensity: number
  carbon_delta_g_per_kwh: number
  qualityTier: QualityTier
  forecast_stability: ForecastStability | null
  score: number
  explanation: string
  sourceUsed: string | null
  referenceTime: string | null
  fallbackUsed: boolean
  providerDisagreement: boolean
  // Grid signal fields
  balancingAuthority?: string | null
  demandRampPct?: number | null
  carbonSpikeProbability?: number | null
  curtailmentProbability?: number | null
  importCarbonLeakageScore?: number | null
  // Data quality flags
  estimatedFlag?: boolean
  syntheticFlag?: boolean
  validationSource?: string | null
  disagreementPct?: number | null
}

// ─── Provider Health ──────────────────────────────────────────────────────────

export interface ProviderStatus {
  name: string
  status: 'healthy' | 'degraded' | 'offline'
  latencyMs: number | null
  lastSuccessAt: string | null
  disagreementPct: number | null
}

export interface MethodologyProviders {
  providers: ProviderStatus[]
}

// ─── DEKES ────────────────────────────────────────────────────────────────────

export interface DekesWorkload {
  id: string
  dekesQueryId: string
  queryString: string
  selectedRegion: string
  actualCO2: number
  status: string
  createdAt: string
}

export interface DekesAnalytics {
  totalWorkloads: number
  totalCO2Saved: number
  averageCarbonIntensity: number
  workloads: DekesWorkload[]
}

// ─── Legacy / Compat ──────────────────────────────────────────────────────────

export interface CarbonForecast {
  region: string
  forecastTime: string
  predictedIntensity: number
  confidence: number
  trend: 'increasing' | 'decreasing' | 'stable'
}

// ─── Intelligence ─────────────────────────────────────────────────────────────

export interface HourlySlot {
  hour: number       // 0–23
  avgIntensity: number
  sampleCount: number
}

export interface RegionPatternData {
  region: string
  slots: HourlySlot[]  // 168 entries: day 0–6, hour 0–23
  overallAvg: number
}

export interface PatternsResponse {
  regions: RegionPatternData[]
  generatedAt: string
}

export interface OpportunityResult {
  region: string
  currentHour: number
  historicalAvg: number
  overallAvg: number
  cleanerThanAvgPct: number   // positive = cleaner, negative = dirtier
  sampleCount: number
}

export interface BestWindowRequest {
  regions: string[]
  durationHours: number
  lookAheadHours?: number
}

export interface BestWindowResult {
  region: string
  startTime: string          // ISO-8601
  endTime: string            // ISO-8601
  avgHistoricalIntensity: number
  overallAvg: number
  cleanerThanAvgPct: number  // % below average
  confidence: 'high' | 'medium' | 'low'
}

// ─── Grid Intelligence ───────────────────────────────────────────────────────

export interface GridSignalSummaryRegion {
  region: string
  balancingAuthority: string | null
  demandRampPct: number | null
  renewableRatio: number | null
  fossilRatio: number | null
  carbonSpikeProbability: number | null
  curtailmentProbability: number | null
  importCarbonLeakageScore: number | null
  signalQuality: 'high' | 'medium' | 'low'
}

export interface GridSignalSummary {
  timestamp: string
  regions: GridSignalSummaryRegion[]
}

export interface CurtailmentWindow {
  region: string
  balancingAuthority: string | null
  startTime: string
  endTime: string
  curtailmentProbability: number
  expectedCarbonIntensity: number | null
  confidence: 'high' | 'medium' | 'low'
}

export interface CarbonSpikeRisk {
  region: string
  balancingAuthority: string | null
  carbonSpikeProbability: number
  expectedRampPct: number | null
  confidence: 'high' | 'medium' | 'low'
}

export interface GridOpportunities {
  timestamp: string
  topCurtailmentWindows: CurtailmentWindow[]
  topCarbonSpikeRisks: CarbonSpikeRisk[]
}

export interface GridHeroMetrics {
  timestamp: string
  carbonReductionMultiplier: number
  carbonAvoidedKgToday: number
  carbonAvoidedKgMonth: number
  highConfidenceDecisionPct: number
  providerDisagreementRatePct: number
}

export interface ImportLeakageEntry {
  region: string
  balancingAuthority: string | null
  importVolumeMwh: number
  leakageScore: number
  neighborCarbonIntensity: number | null
  localCarbonIntensity: number | null
  timestamp: string
  confidence: 'high' | 'medium' | 'low'
  isHeuristicOnly: boolean
}

export interface GridImportLeakage {
  timestamp: string
  topImportLeakages: ImportLeakageEntry[]
  summary: Record<string, ImportLeakageEntry[]>
}

export interface RegionStructuralProfile {
  region: string
  structuralCarbonBaseline: number | null
  carbonTrendDirection: 'increasing' | 'decreasing' | 'stable' | null
  demandTrendTwh: number | null
  demandPerCapita: number | null
  fossilDependenceScore: number | null
  renewableDependenceScore: number | null
  generationMixProfile: Record<string, number> | null
  windCapacityGw: number | null
  solarCapacityGw: number | null
  windCapacityTrend: 'increasing' | 'decreasing' | 'stable' | null
  solarCapacityTrend: 'increasing' | 'decreasing' | 'stable' | null
  confidenceRole: string
  source: string
  updatedAt: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export type CarbonLevel = 'low' | 'medium' | 'high'

export function getCarbonLevel(intensity: number): CarbonLevel {
  if (intensity < 200) return 'low'
  if (intensity < 400) return 'medium'
  return 'high'
}

export function getCarbonColor(level: CarbonLevel): string {
  const colors: Record<CarbonLevel, string> = {
    low: 'text-carbon-low',
    medium: 'text-carbon-medium',
    high: 'text-carbon-high',
  }
  return colors[level]
}

export function getCarbonBgColor(level: CarbonLevel): string {
  const colors: Record<CarbonLevel, string> = {
    low: 'bg-carbon-low',
    medium: 'bg-carbon-medium',
    high: 'bg-carbon-high',
  }
  return colors[level]
}

export function getQualityTierColor(tier: QualityTier): string {
  const colors: Record<QualityTier, string> = {
    high: 'text-emerald-400',
    medium: 'text-yellow-400',
    low: 'text-red-400',
  }
  return colors[tier]
}

export function getQualityTierBadge(tier: QualityTier): string {
  const colors: Record<QualityTier, string> = {
    high: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30',
    medium: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30',
    low: 'bg-red-500/10 text-red-400 border border-red-500/30',
  }
  return colors[tier]
}

export function getStabilityColor(stability: ForecastStability | null): string {
  if (!stability) return 'text-slate-500'
  const colors: Record<ForecastStability, string> = {
    stable: 'text-emerald-400',
    medium: 'text-yellow-400',
    unstable: 'text-red-400',
  }
  return colors[stability]
}

// ─── DEKES Integration ────────────────────────────────────────────────────────
// All types below are READ-ONLY from the dashboard's perspective.
// Handoffs are emitted by the ECOBE engine — never written by the dashboard.

export type DekesHandoffEventType =
  | 'BUDGET_WARNING'
  | 'BUDGET_EXCEEDED'
  | 'POLICY_DELAY'
  | 'POLICY_BLOCK'
  | 'HIGH_CARBON_PATTERN'
  | 'LOW_CONFIDENCE_REGION'
  | 'CLEAN_WINDOW_OPPORTUNITY'
  | 'PROVIDER_DISAGREEMENT_ALERT'
  | 'EXECUTION_DRIFT_RISK'
  | 'ROUTING_POLICY_INSIGHT'

export type HandoffSeverity = 'low' | 'medium' | 'high' | 'critical'
export type HandoffStatus = 'queued' | 'processing' | 'processed' | 'ignored' | 'failed'
export type HandoffClassification = 'opportunity' | 'informational' | 'risk' | 'no_action'

export interface DekesHandoff {
  handoffId: string
  organizationId: string
  decisionId: string | null
  decisionFrameId: string | null
  eventType: DekesHandoffEventType
  severity: HandoffSeverity
  timestamp: string
  status: HandoffStatus
  dekesClassification: HandoffClassification | null
  dekesActionType: string | null
  dekesActionId: string | null
  processedAt: string | null
  routing: {
    selectedRegion: string
    baselineRegion: string
    carbonIntensity: number
    carbonDeltaGPerKwh: number
    qualityTier: QualityTier
    forecastStability: ForecastStability | null
    score: number
  } | null
  budget: {
    status: 'ok' | 'warning' | 'exceeded'
    usedCO2Grams: number
    remainingCO2Grams: number
  } | null
  policy: {
    policyName: string | null
    actionTaken: string | null
  } | null
  explanation: string | null
  replayUrl: string | null
}

export interface DekesIntegrationSummary {
  total: number
  queued: number
  processing: number
  processed: number
  ignored: number
  failed: number
  byEventType: Partial<Record<DekesHandoffEventType, number>>
  opportunitiesGenerated: number
  actionsCreated: number
  highPriorityOrgs: number
  avgProcessingLatencyMs: number | null
}

export interface DekesOrgRisk {
  organizationId: string
  budgetStatus: 'ok' | 'warning' | 'exceeded'
  highCarbonPatternCount: number
  policyDelayCount: number
  latestHandoffType: DekesHandoffEventType | null
  latestClassification: HandoffClassification | null
  totalHandoffs: number
}
