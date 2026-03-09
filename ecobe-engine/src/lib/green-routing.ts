import { prisma } from './db'
import { getBestCarbonSignal } from './carbon/provider-router'
import { assembleDecisionFrame, selectBestRegion } from './decision-data-assembler'
import { reconcileForecastActuals } from './forecast-scorecard'

export interface RoutingRequest {
  preferredRegions: string[]
  maxCarbonGPerKwh?: number
  latencyMsByRegion?: Record<string, number>
  costWeight?: number    // 0-1, default 0.3
  carbonWeight?: number  // 0-1, default 0.5
  latencyWeight?: number // 0-1, default 0.2
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
}

export async function routeGreen(request: RoutingRequest): Promise<RoutingResult> {
  const {
    preferredRegions,
    maxCarbonGPerKwh,
    latencyMsByRegion = {},
    carbonWeight = 0.5,
    latencyWeight = 0.2,
    costWeight = 0.3,
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

    const best = selectBestRegion(frame, {
      maxCarbonGPerKwh,
      carbonWeight,
      latencyWeight,
    })

    // Compute a weighted score using the same formula as the live path so the
    // `score` field has identical semantics regardless of which path ran.
    // (Score = 0–1, higher is better; carbon penalty is primary driver.)
    const allCandidates = frame.regions
    const maxIntensity = Math.max(...allCandidates.map((r) => r.windowAvgIntensity)) || 1
    const maxLatency = Math.max(...allCandidates.map((r) => r.latencyMs)) || 1
    const totalW = carbonWeight + latencyWeight + costWeight
    const wC = carbonWeight / totalW
    const wL = latencyWeight / totalW
    const wCo = costWeight / totalW

    function computeScore(r: typeof best): number {
      const cScore = 1 - r.windowAvgIntensity / maxIntensity
      const lScore = 1 - r.latencyMs / maxLatency
      return wC * cScore + wL * lScore + wCo * cScore // cost ∝ carbon
    }

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
      explanation: buildLiveExplanation(best, regionData, `all regions exceed budget of ${maxCarbonGPerKwh} gCO2/kWh — least-bad selected.`),
      alternatives: sorted.slice(1, 3).map((r) => ({
        region: r.region,
        carbonIntensity: r.carbonIntensity,
        score: 0,
        reason: `Exceeds carbon budget (${maxCarbonGPerKwh} gCO2/kWh)`,
      })),
    }
  }

  const scored = filtered.map((r) => {
    const maxCarbon = Math.max(...filtered.map((x) => x.carbonIntensity))
    const carbonScore = 1 - r.carbonIntensity / maxCarbon

    const maxLatency = Math.max(...filtered.map((x) => x.latency))
    const latencyScore = 1 - r.latency / maxLatency

    const costScore = carbonScore // cost ∝ carbon for now

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
    explanation: buildLiveExplanation(best, regionData),
    alternatives: scored.slice(1, 3).map((r) => ({
      region: r.region,
      carbonIntensity: r.carbonIntensity,
      score: r.score,
    })),
  }
}
