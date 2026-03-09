import { prisma } from './db'
import { getBestCarbonSignal } from './carbon/provider-router'
import { assembleDecisionFrame } from './decision-data-assembler'
import { reconcileForecastActuals, computeRankingStability } from './forecast-scorecard'

export interface RoutingRequest {
  preferredRegions: string[]
  maxCarbonGPerKwh?: number
  latencyMsByRegion?: Record<string, number>
  costWeight?: number    // 0-1, default 0.3
  carbonWeight?: number  // 0-1, default 0.5
  latencyWeight?: number // 0-1, default 0.2
  /**
   * Per-region electricity cost in USD/kWh.
   * When provided, the cost objective uses real prices rather than proxying carbon.
   * When omitted, cost score falls back to the carbon score (cost ∝ carbon).
   */
  costPerKwhByRegion?: Record<string, number>
  /**
   * When the workload is scheduled to run (defaults to now).
   * When set to a future time, routing uses DecisionDataAssembler's
   * forecast-based path (query-time alignment, lazy query planning)
   * instead of the live Redis/Electricity Maps path.
   */
  targetTime?: Date
  /** Expected workload duration in minutes — used by forecast-based path */
  durationMinutes?: number
}

export interface RoutingResult {
  selectedRegion: string
  carbonIntensity: number
  estimatedLatency?: number
  score: number
  alternatives: Array<{
    region: string
    carbonIntensity: number
    score: number
    reason?: string
  }>
  /** Present when the forecast-based assembler path was used */
  decisionFrameId?: string
  forecastAvailable?: boolean
  /**
   * Uncertainty band for the winning region's window average intensity.
   * Derived from actual signal distribution (empirical=true) or estimated
   * from the forecast confidence score (empirical=false).
   * Present on the forecast path; absent on the live path (single point).
   */
  confidenceBand?: { low: number; mid: number; high: number; empirical: boolean }
  /**
   * Human-readable explanation of why this region/time was chosen.
   * Includes intensity vs alternatives, expected reduction %, and data quality.
   * Suitable for dashboard display and API consumers building trust UIs.
   */
  explanation: string
  /**
   * Overall confidence in this routing decision:
   *   high   → live data or empirical forecast band + stable ranking
   *   medium → forecast with estimated band, or overlapping but non-swapping ranges
   *   low    → historical fallback, unstable ranking, or all-failed providers
   */
  qualityTier: 'high' | 'medium' | 'low'
}

/**
 * Map data-quality signals to a routing decision quality tier.
 *   high   → live real-time signal, OR forecast with empirical band + stable ranking
 *   medium → forecast with estimated band, or overlapping (medium stability)
 *   low    → historical fallback (no fresh forecast/live data), or unstable ranking
 */
function computeQualityTier(
  forecastAvailable: boolean,
  empirical: boolean | undefined,
  rankingStability: 'stable' | 'medium' | 'unstable' | 'sole_candidate' | undefined,
  liveSignalPresent?: boolean
): 'high' | 'medium' | 'low' {
  // Live path: quality determined by whether provider returned a real signal
  if (liveSignalPresent !== undefined) {
    return liveSignalPresent ? 'high' : 'low'
  }
  // Forecast path
  if (!forecastAvailable) return 'low'
  if (rankingStability === 'unstable') return 'low'
  if (empirical && (rankingStability === 'stable' || rankingStability === 'sole_candidate')) return 'high'
  return 'medium'
}

export async function routeGreen(request: RoutingRequest): Promise<RoutingResult> {
  const {
    preferredRegions,
    maxCarbonGPerKwh,
    latencyMsByRegion = {},
    carbonWeight = 0.5,
    latencyWeight = 0.2,
    costWeight = 0.3,
    costPerKwhByRegion,
    targetTime,
    durationMinutes,
  } = request

  // ── FORECAST PATH (future targetTime) ───────────────────────────────────────
  // When the caller supplies a targetTime in the future (scheduled workloads,
  // DEKES jobs, CI pipelines), use DecisionDataAssembler to align all inputs to
  // that window with lazy query planning + query-time resolution alignment.
  const now = new Date()
  const isFuture = targetTime && targetTime.getTime() > now.getTime() + 60_000 // >1 min ahead

  if (isFuture && targetTime) {
    const frame = await assembleDecisionFrame({
      regions: preferredRegions,
      targetTime,
      durationMinutes: durationMinutes ?? 60,
      latencyMsByRegion,
    })

    // Apply carbon ceiling filter — keep all if none pass (least-bad fallback)
    let candidates = frame.regions
    if (maxCarbonGPerKwh) {
      const filtered = candidates.filter((r) => r.windowAvgIntensity <= maxCarbonGPerKwh)
      if (filtered.length > 0) candidates = filtered
    }

    // Compute a weighted score using the same formula as the live path so the
    // `score` field has identical semantics regardless of which path ran.
    // (Score = 0–1, higher is better; carbon penalty is primary driver.)
    const maxIntensity = Math.max(...candidates.map((r) => r.windowAvgIntensity)) || 1
    const maxLatency = Math.max(...candidates.map((r) => r.latencyMs)) || 1
    const maxCostPerKwh = costPerKwhByRegion
      ? Math.max(...candidates.map((r) => costPerKwhByRegion[r.region] ?? 0)) || 1
      : 1
    const totalW = carbonWeight + latencyWeight + costWeight
    const wC = carbonWeight / totalW
    const wL = latencyWeight / totalW
    const wCo = costWeight / totalW

    function computeScore(r: (typeof candidates)[0]): number {
      const cScore = 1 - r.windowAvgIntensity / maxIntensity
      const lScore = 1 - r.latencyMs / maxLatency
      const ownCost = costPerKwhByRegion?.[r.region]
      const costScore = ownCost != null && maxCostPerKwh > 0
        ? 1 - ownCost / maxCostPerKwh
        : cScore  // fall back: cost ∝ carbon when no prices provided
      return wC * cScore + wL * lScore + wCo * costScore
    }

    // Pick winner by cost-aware score; stamp ranking stability on the winner's band
    const scored = candidates.map((r) => ({ region: r, score: computeScore(r) }))
    scored.sort((a, b) => b.score - a.score)
    const best = scored[0].region
    const altBands = scored.slice(1).map((s) => s.region.confidenceBand)
    const stability = candidates.length === 1
      ? 'sole_candidate' as const
      : computeRankingStability(best.confidenceBand, altBands)
    best.confidenceBand = { ...best.confidenceBand, rankingStability: stability }

    const others = frame.regions.filter((r) => r.region !== best.region)

    // ── Explanation ───────────────────────────────────────────────────────────
    const worstAlt = [...frame.regions].sort((a, b) => b.windowAvgIntensity - a.windowAvgIntensity)[0]
    const baselineIntensity = worstAlt.windowAvgIntensity
    const reductionPct = baselineIntensity > 0
      ? Math.round(((baselineIntensity - best.windowAvgIntensity) / baselineIntensity) * 100)
      : 0
    const startLabel = targetTime.toISOString().slice(11, 16) + ' UTC'
    const endLabel = new Date(targetTime.getTime() + (durationMinutes ?? 60) * 60_000).toISOString().slice(11, 16) + ' UTC'
    const bandNote = best.confidenceBand.empirical
      ? `uncertainty band ${best.confidenceBand.low}–${best.confidenceBand.high} gCO2/kWh (empirical)`
      : `estimated band ${best.confidenceBand.low}–${best.confidenceBand.high} gCO2/kWh (model confidence ${Math.round(best.forecastConfidence * 100)}%)`
    const trendNote = best.forecastTrend === 'increasing' ? ', rising trend' :
                      best.forecastTrend === 'decreasing' ? ', falling trend' : ''
    const dataNote = best.forecastAvailable ? 'live forecast' : 'historical data (no fresh forecast available)'

    const explanation = others.length > 0
      ? `${best.region} selected for ${startLabel}–${endLabel}: forecast avg ${best.windowAvgIntensity} gCO2/kWh` +
        ` vs ${baselineIntensity} gCO2/kWh in ${worstAlt.region} — ${reductionPct > 0 ? `${reductionPct}% expected reduction` : 'lowest available'}.` +
        ` ${bandNote}${trendNote}. Source: ${dataNote}.`
      : `${best.region} is the only candidate: ${best.windowAvgIntensity} gCO2/kWh at ${startLabel}. Source: ${dataNote}.`

    return {
      selectedRegion: best.region,
      carbonIntensity: best.targetCarbonIntensity,
      estimatedLatency: best.latencyMs,
      score: computeScore(best),
      decisionFrameId: frame.frameId,
      forecastAvailable: best.forecastAvailable,
      confidenceBand: best.confidenceBand,
      explanation,
      qualityTier: computeQualityTier(
        best.forecastAvailable,
        best.confidenceBand.empirical,
        best.confidenceBand.rankingStability,
      ),
      alternatives: others.slice(0, 2).map((r) => ({
        region: r.region,
        carbonIntensity: r.targetCarbonIntensity,
        score: computeScore(r),
        reason: best.forecastAvailable
          ? `Forecast window avg: ${r.windowAvgIntensity} gCO2/kWh`
          : 'Historical fallback used',
      })),
    }
  }

  // ── LIVE PATH (immediate execution) ─────────────────────────────────────────
  // Normalize weights
  const totalWeight = carbonWeight + latencyWeight + costWeight
  const normalizedCarbon = carbonWeight / totalWeight
  const normalizedLatency = latencyWeight / totalWeight
  const normalizedCost = costWeight / totalWeight

  // Get current carbon intensity via multi-provider router (handles cache, fallback, validation)
  const regionData = await Promise.all(
    preferredRegions.map(async (region) => {
      const result = await getBestCarbonSignal(region, 'realtime')
      const carbonIntensity = result.ok && result.signal
        ? result.signal.intensity_gco2_per_kwh
        : 400 // hard fallback if all providers fail

      const readingTime = new Date()

      // Persist to CarbonIntensity history table at native resolution
      await prisma.carbonIntensity.create({
        data: {
          region,
          carbonIntensity,
          timestamp: readingTime,
          source: result.signal?.source?.toUpperCase() ?? 'UNKNOWN',
          resolutionMinutes: 60,
        },
      }).catch((err: any) => {
        if (err?.code !== 'P2002') {
          console.error('[green-routing] carbonIntensity DB write failed:', err?.message ?? err)
        }
      })

      // Non-blocking: reconcile past forecast predictions against this live reading.
      // This populates actualIntensity + error on CarbonForecast rows that predicted
      // this region + time slot, which feeds the rolling accuracy scorecard.
      void reconcileForecastActuals(region, readingTime, carbonIntensity)

      return {
        region,
        carbonIntensity,
        latency: latencyMsByRegion[region] ?? 100,
        providerSignal: result.signal,
      }
    })
  )

  // Filter by max carbon if specified
  const filtered = maxCarbonGPerKwh
    ? regionData.filter((r) => r.carbonIntensity <= maxCarbonGPerKwh)
    : regionData

  function buildLiveExplanation(
    winner: { region: string; carbonIntensity: number },
    all: Array<{ region: string; carbonIntensity: number }>,
    ceilingNote?: string,
  ): string {
    const sorted = [...all].sort((a, b) => b.carbonIntensity - a.carbonIntensity)
    const worst = sorted[0]
    const reductionPct = worst.carbonIntensity > 0
      ? Math.round(((worst.carbonIntensity - winner.carbonIntensity) / worst.carbonIntensity) * 100)
      : 0
    const altParts = all
      .filter((r) => r.region !== winner.region)
      .slice(0, 2)
      .map((r) => `${r.region} ${r.carbonIntensity}`)
      .join(', ')
    const base = `${winner.region} selected for immediate execution: live intensity ${winner.carbonIntensity} gCO2/kWh` +
      (altParts ? ` (vs ${altParts} gCO2/kWh)` : '') +
      (reductionPct > 0 ? ` — ${reductionPct}% cleaner than worst candidate` : '') +
      `. Source: electricity_maps (real-time).`
    return ceilingNote ? `${base} Note: ${ceilingNote}` : base
  }

  if (filtered.length === 0) {
    const sorted = [...regionData].sort((a, b) => a.carbonIntensity - b.carbonIntensity)
    const best = sorted[0]
    return {
      selectedRegion: best.region,
      carbonIntensity: best.carbonIntensity,
      estimatedLatency: best.latency,
      score: 0,
      qualityTier: 'low',
      explanation: buildLiveExplanation(best, regionData, `all regions exceed budget of ${maxCarbonGPerKwh} gCO2/kWh — least-bad selected.`),
      alternatives: sorted.slice(1, 3).map((r) => ({
        region: r.region,
        carbonIntensity: r.carbonIntensity,
        score: 0,
        reason: `Exceeds carbon budget (${maxCarbonGPerKwh} gCO2/kWh)`,
      })),
    }
  }

  const maxCarbonLive = Math.max(...filtered.map((x) => x.carbonIntensity)) || 1
  const maxLatencyLive = Math.max(...filtered.map((x) => x.latency)) || 1
  const maxCostLive = costPerKwhByRegion
    ? Math.max(...filtered.map((x) => costPerKwhByRegion[x.region] ?? 0)) || 1
    : 1

  const scored = filtered.map((r) => {
    const carbonScore = 1 - r.carbonIntensity / maxCarbonLive
    const latencyScore = 1 - r.latency / maxLatencyLive
    const ownCost = costPerKwhByRegion?.[r.region]
    const costScore = ownCost != null && maxCostLive > 0
      ? 1 - ownCost / maxCostLive
      : carbonScore  // fall back: cost ∝ carbon

    const score =
      normalizedCarbon * carbonScore +
      normalizedLatency * latencyScore +
      normalizedCost * costScore

    return { ...r, score, carbonScore, latencyScore, costScore }
  })

  scored.sort((a, b) => b.score - a.score)
  const best = scored[0]

  return {
    selectedRegion: best.region,
    carbonIntensity: best.carbonIntensity,
    estimatedLatency: best.latency,
    score: best.score,
    qualityTier: computeQualityTier(false, undefined, undefined, best.providerSignal != null),
    explanation: buildLiveExplanation(best, regionData),
    alternatives: scored.slice(1, 3).map((r) => ({
      region: r.region,
      carbonIntensity: r.carbonIntensity,
      score: r.score,
    })),
  }
}
