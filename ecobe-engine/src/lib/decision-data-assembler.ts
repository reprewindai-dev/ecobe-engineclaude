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
import { getForecastSignals, getBestCarbonSignal } from './carbon/provider-router'
import { CarbonSignal } from './carbon/types'

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

  // Execute plan — fetch forecasts for all regions via provider router.
  // The router applies lazy query planning, Redis caching, multi-provider
  // fallback, and provenance stamping before we see any signals here.
  const forecastSignalsByRegion = new Map<string, CarbonSignal[]>()
  await Promise.all(
    plan.regions.map(async (region) => {
      const signals = await getForecastSignals(region, plan.forecastWindowStart, plan.forecastWindowEnd)
      forecastSignalsByRegion.set(region, signals)
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
    const latencyMs = req.latencyMsByRegion?.[region] ?? 100

    if (signals.length === 0) {
      // No fresh forecast — fall back to most recent historical reading
      const fallbackIntensity = historical?.carbonIntensity ?? 400
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

    return {
      region,
      targetCarbonIntensity,
      windowAvgIntensity,
      forecastConfidence: avgConfidence,
      forecastTrend,
      dataResolutionMinutes: historical?.resolutionMinutes ?? 60,
      referenceTime: new Date(latestRefIso),
      targetTime: req.targetTime,
      latencyMs,
      forecastAvailable: true,
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
  return scored[0].region
}
