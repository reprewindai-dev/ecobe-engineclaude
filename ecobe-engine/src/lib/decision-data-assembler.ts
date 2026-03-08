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

import { addMinutes, subHours } from 'date-fns'
import { prisma } from './db'

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

interface DecisionQueryPlan {
  regions: string[]
  /** Earliest timestamp we need forecast data for */
  forecastWindowStart: Date
  /** Latest timestamp we need forecast data for */
  forecastWindowEnd: Date
  /** Only fetch forecasts generated after this (freshness filter) */
  referenceTimeFloor: Date
  /** Prisma select — only the columns we actually need */
  selectFields: {
    region: boolean
    forecastTime: boolean
    predictedIntensity: boolean
    confidence: boolean
    referenceTime: boolean
    features: boolean
  }
}

function buildQueryPlan(req: DecisionRequest, now: Date): DecisionQueryPlan {
  const lookAheadMinutes = req.lookAheadMinutes ?? 48 * 60
  return {
    regions: req.regions,
    forecastWindowStart: req.targetTime,
    forecastWindowEnd: addMinutes(req.targetTime, Math.max(req.durationMinutes, lookAheadMinutes)),
    // Only use forecasts that were generated within the last 6 hours (freshness gate)
    referenceTimeFloor: subHours(now, 6),
    selectFields: {
      region: true,
      forecastTime: true,
      predictedIntensity: true,
      confidence: true,
      referenceTime: true,
      features: true,
    },
  }
}

// ─── Core assembler ───────────────────────────────────────────────────────────

/**
 * Assemble a routing decision frame for the given request.
 *
 * Steps:
 *   1. Build query plan (lazy — no I/O yet)
 *   2. Execute plan (one DB round-trip per region, columns pre-filtered)
 *   3. Align data to the targetTime window (query-time alignment)
 *   4. Return a DecisionFrame ready for green-routing / DEKES
 */
export async function assembleDecisionFrame(req: DecisionRequest): Promise<DecisionFrame> {
  const now = new Date()
  const plan = buildQueryPlan(req, now)

  // Execute plan — fetch forecasts for all regions in one query, minimal columns
  const forecastRows = await (prisma as any).carbonForecast.findMany({
    where: {
      region: { in: plan.regions },
      forecastTime: {
        gte: plan.forecastWindowStart,
        lte: plan.forecastWindowEnd,
      },
      referenceTime: { gte: plan.referenceTimeFloor },
    },
    select: plan.selectFields,
    orderBy: [{ region: 'asc' }, { forecastTime: 'asc' }],
  }) as Array<{
    region: string
    forecastTime: Date
    predictedIntensity: number
    confidence: number
    referenceTime: Date
    features: Record<string, unknown>
  }>

  // Also fetch the most recent historical reading as a fallback baseline
  const historyRows = await (prisma as any).carbonIntensity.findMany({
    where: { region: { in: plan.regions } },
    select: {
      region: true,
      carbonIntensity: true,
      resolutionMinutes: true,
      timestamp: true,
    },
    orderBy: { timestamp: 'desc' },
    // Take at most 1 row per region — deduplicate below
    take: plan.regions.length * 5,
  }) as Array<{
    region: string
    carbonIntensity: number
    resolutionMinutes: number
    timestamp: Date
  }>

  // Index by region for O(1) lookups
  const forecastByRegion = new Map<string, typeof forecastRows>()
  for (const row of forecastRows) {
    if (!forecastByRegion.has(row.region)) forecastByRegion.set(row.region, [])
    forecastByRegion.get(row.region)!.push(row)
  }

  const latestHistoryByRegion = new Map<string, (typeof historyRows)[0]>()
  for (const row of historyRows) {
    if (!latestHistoryByRegion.has(row.region)) {
      latestHistoryByRegion.set(row.region, row)
    }
  }

  // ── Align each region to targetTime ──────────────────────────────────────
  const regions: RegionDecisionData[] = req.regions.map((region) => {
    const forecasts = forecastByRegion.get(region) ?? []
    const historical = latestHistoryByRegion.get(region)
    const latencyMs = req.latencyMsByRegion?.[region] ?? 100

    if (forecasts.length === 0) {
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

    // Find the forecast slot closest to targetTime
    const windowEnd = addMinutes(req.targetTime, req.durationMinutes)
    const windowForecasts = forecasts.filter(
      (f) => f.forecastTime >= req.targetTime && f.forecastTime <= windowEnd
    )
    const relevantForecasts = windowForecasts.length > 0 ? windowForecasts : [forecasts[0]]

    // Average intensity across the window (query-time alignment)
    const windowAvgIntensity = Math.round(
      relevantForecasts.reduce((s, f) => s + f.predictedIntensity, 0) / relevantForecasts.length
    )
    const targetCarbonIntensity = relevantForecasts[0].predictedIntensity
    const avgConfidence =
      relevantForecasts.reduce((s, f) => s + f.confidence, 0) / relevantForecasts.length

    // Trend: compare first half vs second half of window
    const mid = Math.floor(relevantForecasts.length / 2)
    const firstHalf = relevantForecasts.slice(0, mid || 1)
    const secondHalf = relevantForecasts.slice(mid || 1)
    const firstAvg = firstHalf.reduce((s, f) => s + f.predictedIntensity, 0) / firstHalf.length
    const secondAvg = secondHalf.reduce((s, f) => s + f.predictedIntensity, 0) / secondHalf.length
    const forecastTrend: 'increasing' | 'decreasing' | 'stable' =
      secondAvg > firstAvg * 1.05
        ? 'increasing'
        : secondAvg < firstAvg * 0.95
          ? 'decreasing'
          : 'stable'

    // Most recent referenceTime from the contributing forecast rows
    const latestRef = relevantForecasts.reduce(
      (latest, f) => (f.referenceTime > latest ? f.referenceTime : latest),
      relevantForecasts[0].referenceTime
    )

    return {
      region,
      targetCarbonIntensity,
      windowAvgIntensity,
      forecastConfidence: avgConfidence,
      forecastTrend,
      dataResolutionMinutes: historical?.resolutionMinutes ?? 60,
      referenceTime: latestRef,
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
