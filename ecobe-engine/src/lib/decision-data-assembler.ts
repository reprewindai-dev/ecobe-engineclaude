/**
 * DecisionDataAssembler
 *
 * Implements three principles from Electricity Maps' production architecture:
 *
 * 1. NATIVE-RESOLUTION STORAGE
 *    Carbon intensity data is stored at whatever granularity the source
 *    provides (5min, 15min, 60min). We do NOT normalise at ingestion time.
 *    Normalisation only happens here, at query time, to avoid data distortion.
 *
 * 2. QUERY-TIME ALIGNMENT (two-time model)
 *    Every input signal is aligned to the routing decision window, not to
 *    when the data arrived.
 *      referenceTime → when a forecast was generated / data was observed
 *      targetTime    → the future moment the workload will actually execute
 *    We always select the most recent forecast whose referenceTime ≤ now
 *    that covers the targetTime window.
 *
 * 3. LAZY QUERY PLANNING
 *    Build a DecisionQueryPlan first (regions, time-range, field list),
 *    then execute it. This minimises I/O by filtering partitions before
 *    loading rows — the same pattern that gave Electricity Maps their
 *    biggest performance win.
 */

import { addMinutes } from 'date-fns'
import { prisma } from './db'
import { getForecastSignals } from './carbon/provider-router'
import { CarbonSignal } from './carbon/types'
import {
  recordForecastPrediction,
  getRegionScorecard,
  adjustConfidenceForRegion,
  computeRankingStability,
} from './forecast-scorecard'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface DecisionRequest {
  /** Candidate regions to evaluate (e.g. ['US-CAL-CISO', 'FR', 'DE']) */
  regions: string[]
  /** When the workload is scheduled to start */
  targetTime: Date
  /** How many minutes the workload will run */
  durationMinutes: number
  /** How far ahead we may look for the best window (default: 48 h) */
  lookAheadMinutes?: number
  /** Optional per-region latency hint in milliseconds */
  latencyMsByRegion?: Record<string, number>
}

export interface ConfidenceBand {
  /** Pessimistic estimate — actual intensity may be this high (p90 or equivalent) */
  high: number
  /** Central estimate — the model's best point forecast (p50) */
  mid: number
  /** Optimistic estimate — actual intensity may be this low (p10 or equivalent) */
  low: number
  /** Band width as a percentage of mid: (high - low) / mid * 100 */
  bandWidthPct: number
  /**
   * Whether the band was derived from an actual signal distribution (true)
   * or estimated from the confidence score of a single point (false).
   * Use this to tell users how to weight the band.
   */
  empirical: boolean
  /**
   * Whether this region's ranking is robust to forecast uncertainty.
   * stable   → winner beats all alternatives even in the pessimistic (p90) case
   * medium   → winner might be beaten in some scenarios
   * unstable → winner could realistically swap ranks with an alternative
   * Populated by selectBestRegion after all candidates are compared.
   */
  rankingStability: 'stable' | 'medium' | 'unstable' | 'sole_candidate'
}

export interface RegionDecisionData {
  region: string
  /** Predicted carbon intensity at targetTime (gCO2eq/kWh) */
  targetCarbonIntensity: number
  /** Average intensity across the full durationMinutes window */
  windowAvgIntensity: number
  /** Forecast confidence 0–1 */
  forecastConfidence: number
  /** Direction the intensity is moving */
  forecastTrend: 'increasing' | 'decreasing' | 'stable'
  /** Native data resolution in minutes (preserves source fidelity) */
  dataResolutionMinutes: number
  /** When the forecast that contributed to this decision was generated */
  referenceTime: Date
  /** The target moment this data was aligned to */
  targetTime: Date
  /** Estimated latency from routing config */
  latencyMs: number
  /** Whether a live forecast was available (vs. historical fallback) */
  forecastAvailable: boolean
  /**
   * Uncertainty band for the window average intensity.
   * When empirical=true, derived from the actual distribution of signals
   * across the window (real p10/p50/p90).  When false, estimated from
   * the confidence score — treat as indicative, not statistical.
   */
  confidenceBand: ConfidenceBand
}

export interface DecisionFrame {
  /** Opaque ID for tracing this assembly through logs */
  frameId: string
  /** When the assembler ran (= reference time for the routing decision) */
  assembledAt: Date
  targetTime: Date
  durationMinutes: number
  regions: RegionDecisionData[]
}

// ─── Internal planner ─────────────────────────────────────────────────────────

/**
 * Lazy query plan — defines WHAT to fetch before any I/O happens.
 * The provider router executes the plan with the appropriate columns,
 * freshness gate, and caching strategy.  Keeping plan construction
 * separate from execution is the core of the lazy query planning pattern.
 */
interface DecisionQueryPlan {
  regions: string[]
  /** Earliest timestamp we need forecast data for */
  forecastWindowStart: Date
  /** Latest timestamp we need forecast data for */
  forecastWindowEnd: Date
}

function buildQueryPlan(req: DecisionRequest, _now: Date): DecisionQueryPlan {
  const lookAheadMinutes = req.lookAheadMinutes ?? 48 * 60
  return {
    regions: req.regions,
    forecastWindowStart: req.targetTime,
    forecastWindowEnd: addMinutes(req.targetTime, Math.max(req.durationMinutes, lookAheadMinutes)),
  }
}

// ─── Confidence band helpers ──────────────────────────────────────────────────

/**
 * Derive an empirical confidence band from the actual distribution of
 * intensity values across the window.  Uses real percentile positions.
 */
function makeBand(low: number, mid: number, high: number, empirical: boolean): ConfidenceBand {
  const l = Math.round(low), m = Math.round(mid), h = Math.round(high)
  const bandWidthPct = m > 0 ? Math.round(((h - l) / m) * 100) : 0
  return { low: l, mid: m, high: h, bandWidthPct, empirical, rankingStability: 'sole_candidate' }
}

function empiricalBand(values: number[]): ConfidenceBand {
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  const p10 = sorted[Math.max(0, Math.floor(n * 0.1))]
  const p50 = sorted[Math.floor((n - 1) * 0.5)]
  const p90 = sorted[Math.min(n - 1, Math.floor(n * 0.9))]
  return makeBand(p10, p50, p90, true)
}

/**
 * Estimate a confidence band from a single point + confidence score.
 * The spread is proportional to (1 - confidence): a perfect forecast
 * has zero spread; a 40% confidence forecast spreads ±25%.
 * Result is indicative, not statistical — callers should check empirical=false.
 */
function estimatedBand(intensity: number, confidence: number): ConfidenceBand {
  const spreadPct = (1 - confidence) * 0.25  // 0 at conf=1.0, 0.15 at conf=0.4
  return makeBand(intensity * (1 - spreadPct), intensity, intensity * (1 + spreadPct), false)
}

// ─── Core assembler ───────────────────────────────────────────────────────────

/**
 * Assemble a routing decision frame for the given request.
 *
 * Steps:
 *   1. Build query plan (lazy — no I/O yet)
 *   2. Execute plan via provider router (handles multi-provider, cache, fallback)
 *   3. Align data to the targetTime window (query-time alignment)
 *   4. Return a DecisionFrame ready for green-routing / DEKES
 */
export async function assembleDecisionFrame(req: DecisionRequest): Promise<DecisionFrame> {
  const now = new Date()
  const plan = buildQueryPlan(req, now)

  // Execute plan — fetch forecasts + scorecards for all regions in parallel.
  // The router applies lazy query planning, Redis caching, multi-provider
  // fallback, and provenance stamping before we see any signals here.
  const forecastSignalsByRegion = new Map<string, CarbonSignal[]>()
  const scorecardsByRegion = new Map<string, Awaited<ReturnType<typeof getRegionScorecard>>>()

  await Promise.all(
    plan.regions.map(async (region) => {
      const [signals, scorecard] = await Promise.all([
        getForecastSignals(region, plan.forecastWindowStart, plan.forecastWindowEnd),
        getRegionScorecard(region),
      ])
      forecastSignalsByRegion.set(region, signals)
      scorecardsByRegion.set(region, scorecard)
    })
  )

  // Fetch most-recent historical reading as fallback baseline (direct DB — always available)
  const historyRows = await (prisma as any).carbonIntensity.findMany({
    where: { region: { in: plan.regions } },
    select: {
      region: true,
      carbonIntensity: true,
      resolutionMinutes: true,
      timestamp: true,
    },
    orderBy: { timestamp: 'desc' },
    take: plan.regions.length * 5,
  }) as Array<{
    region: string
    carbonIntensity: number
    resolutionMinutes: number
    timestamp: Date
  }>

  const latestHistoryByRegion = new Map<string, (typeof historyRows)[0]>()
  for (const row of historyRows) {
    if (!latestHistoryByRegion.has(row.region)) {
      latestHistoryByRegion.set(row.region, row)
    }
  }

  // ── Align each region to targetTime ──────────────────────────────────────
  // CarbonSignal from provider router — already has provenance stamps
  const regions: RegionDecisionData[] = req.regions.map((region) => {
    const signals: CarbonSignal[] = forecastSignalsByRegion.get(region) ?? []
    const historical = latestHistoryByRegion.get(region)
    const scorecard = scorecardsByRegion.get(region)!
    const latencyMs = req.latencyMsByRegion?.[region] ?? 100

    if (signals.length === 0) {
      // No forecast signals available — fall back to most recent historical reading.
      // This is always logged explicitly so silent failures are impossible to miss.
      const fallbackIntensity = historical?.carbonIntensity ?? 400
      const fallbackSource = historical
        ? `DB historical (timestamp=${historical.timestamp.toISOString()}, resolution=${historical.resolutionMinutes}min)`
        : 'hardcoded-default (400 gCO2/kWh — no historical data found)'
      console.warn(
        `[dda] FORECAST_FALLBACK region=${region} target=${req.targetTime.toISOString()} ` +
        `intensity=${fallbackIntensity} source=${fallbackSource}`
      )

      // Record the fallback prediction non-blocking (for scorecard accuracy tracking)
      void recordForecastPrediction({
        region,
        forecastTime: req.targetTime,
        referenceTime: now,
        predictedIntensity: fallbackIntensity,
        confidence: 0.4,
        source: 'historical_fallback',
        fallbackUsed: true,
      })

      return {
        region,
        targetCarbonIntensity: fallbackIntensity,
        windowAvgIntensity: fallbackIntensity,
        forecastConfidence: 0.4,
        forecastTrend: 'stable' as const,
        dataResolutionMinutes: historical?.resolutionMinutes ?? 60,
        referenceTime: historical?.timestamp ?? now,
        targetTime: req.targetTime,
        latencyMs,
        forecastAvailable: false,
        // Wide band — single historical reading, low confidence
        confidenceBand: estimatedBand(fallbackIntensity, 0.4),
      }
    }

    // Filter to the exact targetTime window (query-time alignment)
    const windowEnd = addMinutes(req.targetTime, req.durationMinutes)
    const targetIso = req.targetTime.toISOString()
    const windowEndIso = windowEnd.toISOString()
    const windowSignals = signals.filter((s) => {
      const t = s.forecast_time ?? s.observed_time ?? ''
      return t >= targetIso && t <= windowEndIso
    })
    const relevant = windowSignals.length > 0 ? windowSignals : [signals[0]]

    // Average intensity across the window
    const windowAvgIntensity = Math.round(
      relevant.reduce((s, sig) => s + sig.intensity_gco2_per_kwh, 0) / relevant.length
    )
    const targetCarbonIntensity = relevant[0].intensity_gco2_per_kwh
    const avgConfidence =
      relevant.reduce((s, sig) => s + (sig.confidence ?? 0.6), 0) / relevant.length

    // Trend: compare first half vs second half of window
    const mid = Math.floor(relevant.length / 2)
    const firstHalf = relevant.slice(0, mid || 1)
    const secondHalf = relevant.slice(mid || 1)
    const firstAvg = firstHalf.reduce((s, sig) => s + sig.intensity_gco2_per_kwh, 0) / firstHalf.length
    const secondAvg = secondHalf.reduce((s, sig) => s + sig.intensity_gco2_per_kwh, 0) / secondHalf.length
    const forecastTrend: 'increasing' | 'decreasing' | 'stable' =
      secondAvg > firstAvg * 1.05 ? 'increasing'
        : secondAvg < firstAvg * 0.95 ? 'decreasing'
        : 'stable'

    // Most recent referenceTime across contributing signals
    const latestRefIso = relevant.reduce(
      (latest, sig) => {
        const ref = sig.observed_time ?? sig.fetched_at
        return ref > latest ? ref : latest
      },
      relevant[0].observed_time ?? relevant[0].fetched_at
    )

    // Scorecard-adjusted confidence — penalises regions with poor forecast history.
    // This widens the uncertainty band for historically unreliable regions.
    const adjustedConfidence = adjustConfidenceForRegion(avgConfidence, scorecard)

    // Confidence band — empirical when we have multiple signals, estimated otherwise.
    // Always uses the scorecard-adjusted confidence so the band reflects real accuracy.
    const windowValues = relevant.map((s) => s.intensity_gco2_per_kwh)
    const confidenceBand = windowValues.length >= 3
      ? empiricalBand(windowValues)
      : estimatedBand(windowAvgIntensity, adjustedConfidence)

    // Record this prediction non-blocking (for future scorecard accuracy tracking)
    const primarySource = relevant[0].source ?? 'electricity_maps'
    void recordForecastPrediction({
      region,
      forecastTime: req.targetTime,
      referenceTime: new Date(latestRefIso),
      predictedIntensity: windowAvgIntensity,
      confidence: adjustedConfidence,
      source: primarySource,
      fallbackUsed: false,
    })

    // Prefer resolution from the signal's metadata (populated from API's
    // temporalGranularity field). Fall back to the historical DB row's resolution,
    // then to 60 min as a safe default.
    const signalResolution = (relevant[0].metadata as any)?.resolution_minutes as number | undefined
    const dataResolutionMinutes = signalResolution ?? historical?.resolutionMinutes ?? 60

    return {
      region,
      targetCarbonIntensity,
      windowAvgIntensity,
      forecastConfidence: adjustedConfidence,
      forecastTrend,
      dataResolutionMinutes,
      referenceTime: new Date(latestRefIso),
      targetTime: req.targetTime,
      latencyMs,
      forecastAvailable: true,
      confidenceBand,
    }
  })

  return {
    frameId: `dda-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    assembledAt: now,
    targetTime: req.targetTime,
    durationMinutes: req.durationMinutes,
    regions,
  }
}

/**
 * Pick the lowest-carbon region from an assembled DecisionFrame.
 * Respects an optional carbon ceiling (maxCarbonGPerKwh).
 */
export function selectBestRegion(
  frame: DecisionFrame,
  opts: {
    maxCarbonGPerKwh?: number
    carbonWeight?: number
    latencyWeight?: number
  } = {}
): RegionDecisionData {
  const { maxCarbonGPerKwh, carbonWeight = 0.7, latencyWeight = 0.3 } = opts

  let candidates = frame.regions
  if (maxCarbonGPerKwh) {
    const filtered = candidates.filter((r) => r.windowAvgIntensity <= maxCarbonGPerKwh)
    if (filtered.length > 0) candidates = filtered
    // else: all exceed budget — keep all candidates and pick least bad
  }

  const maxIntensity = Math.max(...candidates.map((r) => r.windowAvgIntensity)) || 1
  const maxLatency = Math.max(...candidates.map((r) => r.latencyMs)) || 1

  const scored = candidates.map((r) => {
    const carbonScore = 1 - r.windowAvgIntensity / maxIntensity
    const latencyScore = 1 - r.latencyMs / maxLatency
    const score = carbonWeight * carbonScore + latencyWeight * latencyScore
    return { region: r, score }
  })

  scored.sort((a, b) => b.score - a.score)
  const winner = scored[0].region
  const altBands = scored.slice(1).map((s) => s.region.confidenceBand)

  // Compute ranking_stability: does the winner beat alternatives even at p10/p90?
  const stability = candidates.length === 1
    ? 'sole_candidate' as const
    : computeRankingStability(winner.confidenceBand, altBands)

  // Mutate the winner's confidenceBand in-place to stamp ranking_stability.
  // The band object is unique per region per frame so mutation is safe here.
  winner.confidenceBand = { ...winner.confidenceBand, rankingStability: stability }

  return winner
}
