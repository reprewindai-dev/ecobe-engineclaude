/**
 * ScheduleRecommendation — unified output shape for all CO2 Router routing decisions.
 *
 * Whether a decision came from:
 *   - immediate live routing (routeGreen, no targetTime)
 *   - future forecast routing (routeGreen with targetTime)
 *   - DEKES batch scheduling (scheduleBatchQueries)
 *
 * ...it should always be representable as a ScheduleRecommendation.
 * This is the shape that dashboards, API consumers, and trust UIs read.
 *
 * Field-by-field alignment with Electricity Maps / Carbon Aware SDK conventions:
 *   selected_region    → where to run
 *   start_time         → when to start (null = execute now)
 *   end_time           → when workload ends
 *   expected_ci        → predicted gCO2/kWh at execution time
 *   baseline_ci        → worst-candidate intensity used for savings calc
 *   expected_savings   → % emissions reduction vs baseline
 *   confidence_band    → p10/p50/p90 uncertainty (empirical or estimated)
 *   source_used        → which provider(s) contributed to this signal
 *   reference_time     → when the forecast/signal was generated
 *   resolution_minutes → native granularity of the underlying data
 *   fallback_used      → whether historical data replaced a missing forecast
 *   forecast_available → false = historical fallback; true = live forecast
 *   score              → normalized 0–1 multi-factor decision score
 *   explanation        → human-readable rationale (dashboard-ready)
 *   decision_frame_id  → assembler trace ID (null for live path)
 */

export interface ScheduleRecommendation {
  selected_region: string

  // ── Timing ────────────────────────────────────────────────────────────────
  /** ISO-8601 — when the workload should start; null means execute immediately */
  start_time: string | null
  /** ISO-8601 — when the workload ends */
  end_time: string | null

  // ── Carbon signal ─────────────────────────────────────────────────────────
  /** Predicted carbon intensity at execution time (gCO2eq/kWh) */
  expected_ci: number
  /** Intensity of the worst candidate (used to compute savings) */
  baseline_ci: number
  /** Expected percentage emissions reduction vs baseline_ci */
  expected_savings_pct: number

  // ── Uncertainty ───────────────────────────────────────────────────────────
  confidence_band: {
    /** Pessimistic estimate — p90 or estimated upper bound */
    high: number
    /** Central estimate — p50 or point forecast */
    mid: number
    /** Optimistic estimate — p10 or estimated lower bound */
    low: number
    /** Whether the band is derived from real signal distribution vs estimated */
    empirical: boolean
  }

  // ── Provenance ────────────────────────────────────────────────────────────
  source_used: string
  /** ISO-8601 — when the contributing forecast/signal was generated */
  reference_time: string | null
  resolution_minutes: number | null
  fallback_used: boolean
  forecast_available: boolean

  // ── Decision quality ──────────────────────────────────────────────────────
  /** Normalized 0–1 score; higher is better; carbon-weighted by default */
  score: number
  /** Human-readable rationale suitable for dashboard display */
  explanation: string
  /** Assembler trace ID — present on forecast path, null on live path */
  decision_frame_id: string | null
  /**
   * Overall confidence in this routing decision:
   *   high   → live data or empirical forecast band + stable ranking
   *   medium → forecast with estimated band, or medium stability
   *   low    → historical fallback, unstable ranking, or budget-ceiling fallback
   */
  quality_tier: 'high' | 'medium' | 'low'

  // ── Decision confidence ───────────────────────────────────────────────────
  /**
   * Absolute carbon intensity savings in gCO2eq/kWh: baseline_ci − selected_ci.
   * The raw number behind expected_savings_pct — useful for ESG reporting.
   */
  carbon_delta_g_per_kwh: number
  /**
   * Whether the winning region's ranking is stable across nearby forecast slots.
   * null on the live path (no multi-slot comparison available).
   */
  forecast_stability: 'stable' | 'medium' | 'unstable' | null
  /**
   * Cross-provider signal disagreement. null when validation was not performed.
   */
  provider_disagreement: { flag: boolean; pct: number | null } | null

  // ── Energy estimate ───────────────────────────────────────────────────────
  estimated_kwh: number | null
  estimated_co2_g: number | null
}

/**
 * Convert a live-path RoutingResult into a ScheduleRecommendation.
 */
export function fromRoutingResult(
  result: {
    selectedRegion: string
    carbonIntensity: number
    score: number
    explanation: string
    decisionFrameId?: string
    forecastAvailable?: boolean
    qualityTier?: 'high' | 'medium' | 'low'
    alternatives: Array<{ region: string; carbonIntensity: number }>
    carbon_delta_g_per_kwh?: number
    forecast_stability?: 'stable' | 'medium' | 'unstable' | null
    provider_disagreement?: { flag: boolean; pct: number | null } | null
  },
  opts: {
    targetTime?: Date
    durationMinutes?: number
    estimatedKwh?: number
    sourceUsed?: string
    referenceTime?: Date
    resolutionMinutes?: number
    fallbackUsed?: boolean
  } = {}
): ScheduleRecommendation {
  const {
    targetTime,
    durationMinutes = 60,
    estimatedKwh,
    sourceUsed = 'electricity_maps',
    referenceTime,
    resolutionMinutes,
    fallbackUsed = false,
  } = opts

  const start = targetTime ?? null
  const end = start ? new Date(start.getTime() + durationMinutes * 60_000) : null

  // Baseline = worst alternative, or the chosen if only one candidate
  const allIntensities = [
    result.carbonIntensity,
    ...result.alternatives.map((a) => a.carbonIntensity),
  ]
  const baselineCi = Math.max(...allIntensities)
  const savingsPct = baselineCi > 0
    ? Math.round(((baselineCi - result.carbonIntensity) / baselineCi) * 100)
    : 0

  return {
    selected_region: result.selectedRegion,
    start_time: start?.toISOString() ?? null,
    end_time: end?.toISOString() ?? null,
    expected_ci: result.carbonIntensity,
    baseline_ci: baselineCi,
    expected_savings_pct: Math.max(0, savingsPct),
    confidence_band: { high: result.carbonIntensity, mid: result.carbonIntensity, low: result.carbonIntensity, empirical: false },
    source_used: sourceUsed,
    reference_time: referenceTime?.toISOString() ?? null,
    resolution_minutes: resolutionMinutes ?? null,
    fallback_used: fallbackUsed,
    forecast_available: result.forecastAvailable ?? false,
    score: result.score,
    explanation: result.explanation,
    decision_frame_id: result.decisionFrameId ?? null,
    quality_tier: result.qualityTier ?? 'medium',
    carbon_delta_g_per_kwh: result.carbon_delta_g_per_kwh ?? Math.max(0, baselineCi - result.carbonIntensity),
    forecast_stability: result.forecast_stability ?? null,
    provider_disagreement: result.provider_disagreement ?? null,
    estimated_kwh: estimatedKwh ?? null,
    estimated_co2_g: estimatedKwh != null ? Math.round(estimatedKwh * result.carbonIntensity * 1000) / 1000 : null,
  }
}

/**
 * Convert a DEKES DekesScheduleEntry into a ScheduleRecommendation.
 */
export function fromDekesEntry(
  entry: {
    queryId: string
    selectedRegion: string
    scheduledTime: Date
    predictedCarbonIntensity: number
    estimatedKwh: number
    estimatedCO2: number
    savings: number
    explanation?: string
  },
  durationMinutes = 60
): ScheduleRecommendation {
  const end = new Date(entry.scheduledTime.getTime() + durationMinutes * 60_000)
  const baselineCi = Math.round(entry.predictedCarbonIntensity / (1 - entry.savings / 100)) || entry.predictedCarbonIntensity

  return {
    selected_region: entry.selectedRegion,
    start_time: entry.scheduledTime.toISOString(),
    end_time: end.toISOString(),
    expected_ci: entry.predictedCarbonIntensity,
    baseline_ci: baselineCi,
    expected_savings_pct: Math.max(0, Math.round(entry.savings)),
    confidence_band: { high: entry.predictedCarbonIntensity, mid: entry.predictedCarbonIntensity, low: entry.predictedCarbonIntensity, empirical: false },
    source_used: 'electricity_maps',
    reference_time: null,
    resolution_minutes: null,
    fallback_used: false,
    forecast_available: true,
    score: 0,
    explanation: entry.explanation ?? `${entry.selectedRegion} scheduled at ${entry.scheduledTime.toISOString().slice(11, 16)} UTC: predicted ${entry.predictedCarbonIntensity} gCO2/kWh, ${Math.round(entry.savings)}% vs immediate.`,
    decision_frame_id: null,
    quality_tier: 'medium',  // DEKES uses forecast data — empirical band not yet computed
    carbon_delta_g_per_kwh: Math.max(0, baselineCi - entry.predictedCarbonIntensity),
    forecast_stability: null,    // DEKES path doesn't compute ranking stability
    provider_disagreement: null, // DEKES path uses aggregated forecast signals
    estimated_kwh: entry.estimatedKwh,
    estimated_co2_g: Math.round(entry.estimatedCO2 * 1000) / 1000,
  }
}
