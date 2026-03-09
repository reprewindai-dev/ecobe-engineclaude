/**
 * ForecastScorecard — Phase 2A regional backtesting system.
 *
 * Architecture:
 *   1. recordForecastPrediction()  → write to CarbonForecast when assembler runs
 *   2. reconcileForecastActuals()  → called after live readings are stored;
 *      updates CarbonForecast.actualIntensity + error for past predictions
 *   3. recomputeScorecard()        → aggregates rolling accuracy metrics into
 *      RegionForecastScorecard; called by reconcile (non-blocking)
 *   4. getRegionScorecard()        → fast single-row read for the assembler
 *   5. adjustConfidenceForRegion() → nudge confidence down for unreliable regions
 *
 * Horizon buckets:
 *   24h  = forecastTime is 0–24 h ahead of referenceTime
 *   48h  = 24–48 h
 *   72h  = 48–72 h
 *
 * Reliability tiers:
 *   high    → mape24h < 0.10 AND fallbackRate < 0.15
 *   medium  → mape24h 0.10–0.25 OR fallbackRate 0.15–0.35
 *   low     → mape24h > 0.25 OR fallbackRate > 0.35
 *   unknown → sampleCount < MIN_SAMPLE_COUNT (10)
 */

import { prisma } from './db'

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_SAMPLE_COUNT = 10       // minimum observations before reliability is rated
const ROLLING_WINDOW_DAYS = 30    // how far back we look for accuracy metrics
const HIGH_MAPE_THRESHOLD = 0.10  // below → 'high'
const LOW_MAPE_THRESHOLD  = 0.25  // above → 'low'
const HIGH_FALLBACK_THRESHOLD = 0.15
const LOW_FALLBACK_THRESHOLD  = 0.35

// ── Public types ──────────────────────────────────────────────────────────────

export type ReliabilityTier = 'high' | 'medium' | 'low' | 'unknown'

export interface RegionScorecard {
  region: string
  mae24h:   number | null
  mae48h:   number | null
  mae72h:   number | null
  mape24h:  number | null
  mape48h:  number | null
  mape72h:  number | null
  fallbackRate:             number
  staleRejectionRate:       number
  providerDisagreementRate: number
  forecastHitRate:          number
  reliabilityTier: ReliabilityTier
  sampleCount:     number
  lastComputedAt:  Date | null
}

// ── Default scorecard (returned when no data exists) ──────────────────────────

const UNKNOWN_SCORECARD = (region: string): RegionScorecard => ({
  region,
  mae24h: null, mae48h: null, mae72h: null,
  mape24h: null, mape48h: null, mape72h: null,
  fallbackRate: 0, staleRejectionRate: 0, providerDisagreementRate: 0,
  forecastHitRate: 0, reliabilityTier: 'unknown', sampleCount: 0,
  lastComputedAt: null,
})

// ── 1. Record a prediction ────────────────────────────────────────────────────

/**
 * Persist a prediction from assembleDecisionFrame into CarbonForecast.
 * Called non-blocking (void) — a failure here must not affect routing.
 */
export async function recordForecastPrediction(opts: {
  region: string
  forecastTime: Date    // targetTime — when the workload will run
  referenceTime: Date   // now — when the prediction was made
  predictedIntensity: number
  confidence: number
  source: string        // e.g. 'electricity_maps', 'historical_fallback'
  fallbackUsed: boolean
}): Promise<void> {
  const horizonHours =
    (opts.forecastTime.getTime() - opts.referenceTime.getTime()) / (1000 * 60 * 60)

  try {
    await (prisma as any).carbonForecast.upsert({
      where: {
        region_forecastTime_source: {
          region: opts.region,
          forecastTime: opts.forecastTime,
          source: opts.source,
        },
      },
      create: {
        region: opts.region,
        source: opts.source,
        forecastTime: opts.forecastTime,
        referenceTime: opts.referenceTime,
        horizonHours,
        predictedIntensity: Math.round(opts.predictedIntensity),
        confidence: opts.confidence,
        features: { fallbackUsed: opts.fallbackUsed },
      },
      update: {
        // If a newer prediction arrives for the same (region, forecastTime, source),
        // update only if it has a more recent referenceTime (fresher forecast wins).
        referenceTime: opts.referenceTime,
        horizonHours,
        predictedIntensity: Math.round(opts.predictedIntensity),
        confidence: opts.confidence,
        features: { fallbackUsed: opts.fallbackUsed },
      },
    })
  } catch (err: any) {
    // Non-fatal — log and continue routing
    console.error('[scorecard] recordForecastPrediction failed:', err?.message ?? err)
  }
}

// ── 2. Reconcile actuals ──────────────────────────────────────────────────────

/**
 * After a live reading is stored, look back and update CarbonForecast rows
 * that predicted this (region, time) slot.  Computes signed error per row.
 * Then triggers a non-blocking scorecard recompute.
 */
export async function reconcileForecastActuals(
  region: string,
  actualTime: Date,
  actualIntensity: number
): Promise<void> {
  try {
    // Window: actual reading covers ±resolutionMinutes of its timestamp
    const windowMs = 30 * 60 * 1000 // ±30 min
    const from = new Date(actualTime.getTime() - windowMs)
    const to   = new Date(actualTime.getTime() + windowMs)

    const predictions = await (prisma as any).carbonForecast.findMany({
      where: {
        region,
        forecastTime: { gte: from, lte: to },
        actualIntensity: null, // not yet reconciled
      },
      select: { id: true, predictedIntensity: true },
    }) as Array<{ id: string; predictedIntensity: number }>

    if (predictions.length === 0) return

    await Promise.all(
      predictions.map((p) =>
        (prisma as any).carbonForecast.update({
          where: { id: p.id },
          data: {
            actualIntensity: Math.round(actualIntensity),
            error: p.predictedIntensity - actualIntensity,
          },
        })
      )
    )

    // Non-blocking recompute of the region scorecard
    void recomputeScorecard(region)
  } catch (err: any) {
    console.error('[scorecard] reconcileForecastActuals failed:', err?.message ?? err)
  }
}

// ── 3. Recompute regional scorecard ──────────────────────────────────────────

/**
 * Aggregate the last ROLLING_WINDOW_DAYS of reconciled predictions into
 * per-horizon MAE/MAPE, then upsert RegionForecastScorecard.
 */
async function recomputeScorecard(region: string): Promise<void> {
  const windowStart = new Date(Date.now() - ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  const rows = await (prisma as any).carbonForecast.findMany({
    where: {
      region,
      createdAt: { gte: windowStart },
      actualIntensity: { not: null },
    },
    select: {
      predictedIntensity: true,
      actualIntensity: true,
      error: true,
      horizonHours: true,
    },
  }) as Array<{
    predictedIntensity: number
    actualIntensity: number
    error: number
    horizonHours: number
  }>

  if (rows.length === 0) return

  function bucket(h: number) {
    if (h <= 24) return '24h'
    if (h <= 48) return '48h'
    return '72h'
  }

  const buckets: Record<string, Array<{ absErr: number; absPctErr: number }>> = {
    '24h': [], '48h': [], '72h': [],
  }

  for (const row of rows) {
    const absErr = Math.abs(row.error)
    const absPctErr = row.actualIntensity > 0 ? absErr / row.actualIntensity : 0
    buckets[bucket(row.horizonHours)].push({ absErr, absPctErr })
  }

  function avg(arr: number[]): number | null {
    if (arr.length === 0) return null
    return arr.reduce((s, v) => s + v, 0) / arr.length
  }

  const mae24h  = avg(buckets['24h'].map((r) => r.absErr))
  const mae48h  = avg(buckets['48h'].map((r) => r.absErr))
  const mae72h  = avg(buckets['72h'].map((r) => r.absErr))
  const mape24h = avg(buckets['24h'].map((r) => r.absPctErr))
  const mape48h = avg(buckets['48h'].map((r) => r.absPctErr))
  const mape72h = avg(buckets['72h'].map((r) => r.absPctErr))

  // Fallback rate: fraction of recent predictions that used historical fallback
  const allRecent = await (prisma as any).carbonForecast.findMany({
    where: { region, createdAt: { gte: windowStart } },
    select: { features: true },
  }) as Array<{ features: any }>

  const fallbackCount = allRecent.filter((r) => (r.features as any)?.fallbackUsed === true).length
  const fallbackRate = allRecent.length > 0 ? fallbackCount / allRecent.length : 0

  const reliabilityTier = computeReliabilityTier(mape24h, fallbackRate, rows.length)

  try {
    await (prisma as any).regionForecastScorecard.upsert({
      where: { region },
      create: {
        region,
        mae24h, mae48h, mae72h,
        mape24h, mape48h, mape72h,
        fallbackRate,
        staleRejectionRate: 0,
        providerDisagreementRate: 0,
        forecastHitRate: 0,
        reliabilityTier,
        sampleCount: rows.length,
        lastComputedAt: new Date(),
      },
      update: {
        mae24h, mae48h, mae72h,
        mape24h, mape48h, mape72h,
        fallbackRate,
        reliabilityTier,
        sampleCount: rows.length,
        lastComputedAt: new Date(),
      },
    })
  } catch (err: any) {
    console.error('[scorecard] recomputeScorecard upsert failed:', err?.message ?? err)
  }
}

function computeReliabilityTier(
  mape24h: number | null,
  fallbackRate: number,
  sampleCount: number
): ReliabilityTier {
  if (sampleCount < MIN_SAMPLE_COUNT) return 'unknown'
  if (mape24h === null) return 'unknown'

  if (mape24h <= HIGH_MAPE_THRESHOLD && fallbackRate <= HIGH_FALLBACK_THRESHOLD) return 'high'
  if (mape24h > LOW_MAPE_THRESHOLD || fallbackRate > LOW_FALLBACK_THRESHOLD) return 'low'
  return 'medium'
}

// ── 4. Read scorecard ─────────────────────────────────────────────────────────

/**
 * Fast single-row lookup — assembler calls this to get per-region reliability.
 * Returns UNKNOWN_SCORECARD when no data exists (graceful degradation).
 */
export async function getRegionScorecard(region: string): Promise<RegionScorecard> {
  try {
    const row = await (prisma as any).regionForecastScorecard.findUnique({
      where: { region },
    })
    if (!row) return UNKNOWN_SCORECARD(region)

    return {
      region: row.region,
      mae24h: row.mae24h,
      mae48h: row.mae48h,
      mae72h: row.mae72h,
      mape24h: row.mape24h,
      mape48h: row.mape48h,
      mape72h: row.mape72h,
      fallbackRate: row.fallbackRate,
      staleRejectionRate: row.staleRejectionRate,
      providerDisagreementRate: row.providerDisagreementRate,
      forecastHitRate: row.forecastHitRate,
      reliabilityTier: row.reliabilityTier as ReliabilityTier,
      sampleCount: row.sampleCount,
      lastComputedAt: row.lastComputedAt,
    }
  } catch {
    return UNKNOWN_SCORECARD(region)
  }
}

// ── 5. Confidence adjustment ──────────────────────────────────────────────────

/**
 * Nudge the model confidence down for regions with poor forecast history.
 * This is a multiplicative penalty — a low reliability region has its
 * confidence reduced, making the uncertainty band wider.
 *
 * Penalty multipliers:
 *   high    → 1.0   (no penalty — use stated confidence as-is)
 *   medium  → 0.85  (slight haircut)
 *   low     → 0.65  (meaningful reduction)
 *   unknown → 0.80  (conservative — not enough data to trust stated confidence)
 */
const RELIABILITY_MULTIPLIER: Record<ReliabilityTier, number> = {
  high:    1.00,
  medium:  0.85,
  low:     0.65,
  unknown: 0.80,
}

export function adjustConfidenceForRegion(
  statedConfidence: number,
  scorecard: RegionScorecard
): number {
  const multiplier = RELIABILITY_MULTIPLIER[scorecard.reliabilityTier]
  return Math.min(1, Math.max(0, statedConfidence * multiplier))
}

// ── 6. Ranking stability ──────────────────────────────────────────────────────

/**
 * Compute ranking_stability for a winning region against alternatives.
 *
 * Algorithm (carbon-intensity domain — lower is better):
 *
 *   stable   → winner.high < all alternatives' low
 *              (winner beats every alternative even in its worst case)
 *   medium   → winner.low < all alternatives' low but winner.high >= some alt.low
 *              (winner is likely better but intensity ranges overlap)
 *   unstable → winner.low >= any alternative's low
 *              (alternative could realistically have lower intensity than winner)
 */
export function computeRankingStability(
  winner: { low: number; mid: number; high: number },
  alternatives: Array<{ low: number; mid: number; high: number }>
): 'stable' | 'medium' | 'unstable' {
  if (alternatives.length === 0) return 'stable'

  // unstable: winner's p10 >= any alt's p10 → alternative may be lower in optimistic scenario
  const hasUnstable = alternatives.some((alt) => winner.low >= alt.low)
  if (hasUnstable) return 'unstable'

  // medium: winner's p90 >= any alt's p10 → ranges overlap even though winner's p10 is lower
  const hasOverlap = alternatives.some((alt) => winner.high >= alt.low)
  if (hasOverlap) return 'medium'

  // stable: winner's p90 < all alt's p10 → winner dominates across the full band
  return 'stable'
}
