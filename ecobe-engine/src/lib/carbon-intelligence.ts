/**
 * Carbon Intelligence — Temporal Pattern Engine
 *
 * This is the layer that differentiates CO₂ Router from Google's Carbon-Aware
 * Scheduler and every other reactive carbon routing tool.
 *
 * Google's scheduler: read current signal → pick lowest → route.
 * CO₂ Router:         read current signal + LEARNED HISTORICAL PATTERNS
 *                     → predict probability of intensity drop
 *                     → route with confidence-weighted decision.
 *
 * How it works:
 *   1. computeTemporalPatterns(region)
 *      Reads historical CarbonIntensity records, groups by hour-of-week
 *      (0 = Mon 00:00 UTC … 167 = Sun 23:00 UTC), computes distribution
 *      statistics (avg, p10, p50, p90, stddev) for each slot, and upserts
 *      into RegionTemporalPattern.
 *
 *   2. predictOpportunityScore(region, fromHourOfWeek, durationHours)
 *      Looks up temporal patterns for the target window and computes
 *      an opportunity score: probability that intensity will be
 *      meaningfully lower than the current average during that window.
 *
 *   3. getBestWindowForRegion(region, durationHours, lookAheadHours)
 *      Scans the next N hours of temporal patterns (wrapping around the
 *      weekly cycle) and returns the best upcoming window — when the
 *      region is historically cleanest.
 *
 *   4. getAllScorecards()
 *      Retrieves all RegionForecastScorecard rows — used by the intelligence
 *      API to expose region reliability in one call.
 *
 * Pattern refresh:
 *   Call computeTemporalPatterns() per region on a nightly schedule.
 *   It is idempotent — safe to run repeatedly.
 *
 * Hour-of-week encoding:
 *   hourOfWeek = dayIndex * 24 + utcHour
 *   where dayIndex: Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6
 *   Derived from: ((date.getUTCDay() + 6) % 7) * 24 + date.getUTCHours()
 */

import { prisma } from './db'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TemporalSlot {
  hourOfWeek: number
  label: string       // e.g. "Mon 03:00 UTC"
  avgIntensity: number
  p10Intensity: number
  p50Intensity: number
  p90Intensity: number
  stddev: number
  sampleCount: number
}

export interface OpportunityPrediction {
  region: string
  fromHourOfWeek: number
  durationHours: number
  opportunityScore: number        // 0–1: probability of meaningful drop
  expectedAvgIntensity: number    // avg intensity across the window
  expectedP10Intensity: number    // optimistic bound
  vsRegionAvg: number             // delta from region 24h average (negative = cleaner)
  confidence: 'high' | 'medium' | 'low' | 'insufficient_data'
  bestSlotHourOfWeek: number
  bestSlotLabel: string
}

export interface BestWindow {
  region: string
  startHourOfWeek: number
  startLabel: string
  durationHours: number
  expectedAvgIntensity: number
  expectedP10Intensity: number
  vsRegionAvg: number             // % change vs region 24h avg (negative = cleaner)
  score: number                   // 0–1 composite
  lookAheadMinutes: number        // minutes from now until window starts
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function hourOfWeekFromDate(d: Date): number {
  const dayIndex = (d.getUTCDay() + 6) % 7 // Mon=0 … Sun=6
  return dayIndex * 24 + d.getUTCHours()
}

function hourOfWeekLabel(h: number): string {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const day = days[Math.floor(h / 24) % 7] ?? 'Mon'
  const hour = h % 24
  return `${day} ${String(hour).padStart(2, '0')}:00 UTC`
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo] ?? 0
  const frac = idx - lo
  return (sorted[lo] ?? 0) + ((sorted[hi] ?? 0) - (sorted[lo] ?? 0)) * frac
}

function stdDev(values: number[], mean: number): number {
  if (values.length < 2) return 0
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

const PATTERN_WINDOW_DAYS = 90

// ─── 1. computeTemporalPatterns ───────────────────────────────────────────────

/**
 * Reads historical CarbonIntensity for a region and builds the 168-slot
 * hourly pattern table.  Safe to call repeatedly (upsert).
 *
 * Returns the number of rows upserted (0–168).
 */
export async function computeTemporalPatterns(region: string): Promise<number> {
  const since = new Date(Date.now() - PATTERN_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  const records = await (prisma as any).carbonIntensity.findMany({
    where: { region, timestamp: { gte: since } },
    select: { carbonIntensity: true, timestamp: true },
    orderBy: { timestamp: 'asc' },
  }) as Array<{ carbonIntensity: number; timestamp: Date }>

  if (records.length < 24) return 0 // not enough data for meaningful patterns

  // Group by hourOfWeek
  const buckets = new Map<number, number[]>()
  for (const r of records) {
    const h = hourOfWeekFromDate(new Date(r.timestamp))
    if (!buckets.has(h)) buckets.set(h, [])
    buckets.get(h)!.push(r.carbonIntensity)
  }

  let upserted = 0
  for (const [h, values] of buckets.entries()) {
    if (values.length < 2) continue

    const sorted = [...values].sort((a, b) => a - b)
    const avg = values.reduce((s, v) => s + v, 0) / values.length
    const p10 = percentile(sorted, 0.10)
    const p50 = percentile(sorted, 0.50)
    const p90 = percentile(sorted, 0.90)
    const sd  = stdDev(values, avg)

    await (prisma as any).regionTemporalPattern.upsert({
      where: { region_hourOfWeek: { region, hourOfWeek: h } },
      create: {
        region,
        hourOfWeek: h,
        avgIntensity: avg,
        p10Intensity: p10,
        p50Intensity: p50,
        p90Intensity: p90,
        stddev: sd,
        sampleCount: values.length,
      },
      update: {
        avgIntensity: avg,
        p10Intensity: p10,
        p50Intensity: p50,
        p90Intensity: p90,
        stddev: sd,
        sampleCount: values.length,
      },
    })
    upserted++
  }

  return upserted
}

// ─── 2. getTemporalPatterns ───────────────────────────────────────────────────

/**
 * Returns all 168 temporal slots for a region (or fewer if not all have data).
 */
export async function getTemporalPatterns(region: string): Promise<TemporalSlot[]> {
  const rows = await (prisma as any).regionTemporalPattern.findMany({
    where: { region },
    orderBy: { hourOfWeek: 'asc' },
  }) as Array<{
    hourOfWeek: number
    avgIntensity: number
    p10Intensity: number
    p50Intensity: number
    p90Intensity: number
    stddev: number
    sampleCount: number
  }>

  return rows.map((r) => ({
    hourOfWeek:   r.hourOfWeek,
    label:        hourOfWeekLabel(r.hourOfWeek),
    avgIntensity: Math.round(r.avgIntensity),
    p10Intensity: Math.round(r.p10Intensity),
    p50Intensity: Math.round(r.p50Intensity),
    p90Intensity: Math.round(r.p90Intensity),
    stddev:       Math.round(r.stddev),
    sampleCount:  r.sampleCount,
  }))
}

// ─── 3. predictOpportunityScore ───────────────────────────────────────────────

/**
 * Given a region and a future time window, returns an opportunity score:
 * how likely is this region to be meaningfully cleaner than its own average
 * during that window, based purely on historical patterns.
 *
 * This is what Google's scheduler cannot compute — it only has the current
 * signal, not the historical distribution of what happens at this hour.
 */
export async function predictOpportunityScore(
  region: string,
  fromHourOfWeek: number,
  durationHours: number,
): Promise<OpportunityPrediction> {
  const insufficient: OpportunityPrediction = {
    region,
    fromHourOfWeek,
    durationHours,
    opportunityScore: 0,
    expectedAvgIntensity: 0,
    expectedP10Intensity: 0,
    vsRegionAvg: 0,
    confidence: 'insufficient_data',
    bestSlotHourOfWeek: fromHourOfWeek,
    bestSlotLabel: hourOfWeekLabel(fromHourOfWeek),
  }

  // Fetch all patterns for this region
  const allPatterns = await (prisma as any).regionTemporalPattern.findMany({
    where: { region },
  }) as Array<{ hourOfWeek: number; avgIntensity: number; p10Intensity: number; sampleCount: number }>

  if (allPatterns.length < 24) return insufficient

  // Build a lookup map
  const byHour = new Map(allPatterns.map((p) => [p.hourOfWeek, p]))

  // Compute region-wide 24h average (used as baseline)
  const regionAvg = allPatterns.reduce((s, p) => s + p.avgIntensity, 0) / allPatterns.length

  // Collect patterns for the target window (wrapping around 168)
  const windowSlots: Array<{ hourOfWeek: number; avg: number; p10: number }> = []
  for (let i = 0; i < durationHours; i++) {
    const h = (fromHourOfWeek + i) % 168
    const p = byHour.get(h)
    if (p) windowSlots.push({ hourOfWeek: h, avg: p.avgIntensity, p10: p.p10Intensity })
  }

  if (windowSlots.length === 0) return insufficient

  const windowAvg = windowSlots.reduce((s, s2) => s + s2.avg, 0) / windowSlots.length
  const windowP10 = windowSlots.reduce((s, s2) => s + s2.p10, 0) / windowSlots.length
  const bestSlot  = windowSlots.reduce((best, s) => s.avg < best.avg ? s : best, windowSlots[0]!)

  // Opportunity score: how much cleaner is the window vs region average?
  // Score of 1.0 means window is historically 40%+ below average (excellent opportunity)
  // Score of 0.0 means window is at or above average (no opportunity)
  const delta = regionAvg - windowAvg
  const dropFraction = regionAvg > 0 ? delta / regionAvg : 0
  const opportunityScore = Math.max(0, Math.min(1, dropFraction / 0.40))

  // Confidence based on sample count
  const minSamples = windowSlots.reduce((m, s) => {
    const p = byHour.get(s.hourOfWeek)
    return p ? Math.min(m, p.sampleCount) : m
  }, Infinity)

  const confidence: OpportunityPrediction['confidence'] =
    minSamples === Infinity ? 'insufficient_data'
    : minSamples >= 10     ? 'high'
    : minSamples >= 4      ? 'medium'
    : 'low'

  return {
    region,
    fromHourOfWeek,
    durationHours,
    opportunityScore: Math.round(opportunityScore * 100) / 100,
    expectedAvgIntensity: Math.round(windowAvg),
    expectedP10Intensity: Math.round(windowP10),
    vsRegionAvg: Math.round(dropFraction * 100),   // positive = cleaner than average
    confidence,
    bestSlotHourOfWeek: bestSlot.hourOfWeek,
    bestSlotLabel: hourOfWeekLabel(bestSlot.hourOfWeek),
  }
}

// ─── 4. getBestWindowForRegion ────────────────────────────────────────────────

/**
 * Scans the next lookAheadHours of temporal patterns (from now) and returns
 * the best upcoming window — when this region is historically cleanest.
 *
 * Returns null if insufficient pattern data exists.
 */
export async function getBestWindowForRegion(
  region: string,
  durationHours: number,
  lookAheadHours: number,
): Promise<BestWindow | null> {
  const allPatterns = await (prisma as any).regionTemporalPattern.findMany({
    where: { region },
  }) as Array<{ hourOfWeek: number; avgIntensity: number; p10Intensity: number; sampleCount: number }>

  if (allPatterns.length < 24) return null

  const byHour = new Map(allPatterns.map((p) => [p.hourOfWeek, p]))
  const regionAvg = allPatterns.reduce((s, p) => s + p.avgIntensity, 0) / allPatterns.length

  const nowHourOfWeek = hourOfWeekFromDate(new Date())
  let bestStart: number | null = null
  let bestScore = -Infinity

  // Scan each possible start hour within the look-ahead window
  for (let offset = 0; offset < lookAheadHours - durationHours + 1; offset++) {
    const startHour = (nowHourOfWeek + offset) % 168

    // Average intensity across the duration window
    let windowSum = 0
    let windowP10Sum = 0
    let slots = 0
    for (let i = 0; i < durationHours; i++) {
      const h = (startHour + i) % 168
      const p = byHour.get(h)
      if (p) {
        windowSum += p.avgIntensity
        windowP10Sum += p.p10Intensity
        slots++
      }
    }
    if (slots === 0) continue

    const windowAvg = windowSum / slots
    // Score: lower avg = better. Normalize against region average.
    const score = regionAvg > 0 ? (regionAvg - windowAvg) / regionAvg : 0

    if (score > bestScore) {
      bestScore = score
      bestStart = startHour
    }
  }

  if (bestStart === null) return null

  // Compute final stats for the best window
  let finalAvg = 0
  let finalP10 = 0
  let finalSlots = 0
  for (let i = 0; i < durationHours; i++) {
    const h = (bestStart + i) % 168
    const p = byHour.get(h)
    if (p) { finalAvg += p.avgIntensity; finalP10 += p.p10Intensity; finalSlots++ }
  }
  if (finalSlots === 0) return null

  finalAvg /= finalSlots
  finalP10 /= finalSlots

  // How many minutes until the best window starts?
  const nowHour = hourOfWeekFromDate(new Date())
  let offsetHours = (bestStart - nowHour + 168) % 168
  if (offsetHours > lookAheadHours) offsetHours = 0

  return {
    region,
    startHourOfWeek: bestStart,
    startLabel: hourOfWeekLabel(bestStart),
    durationHours,
    expectedAvgIntensity: Math.round(finalAvg),
    expectedP10Intensity: Math.round(finalP10),
    vsRegionAvg: Math.round(bestScore * 100),      // positive = cleaner than avg
    score: Math.round(Math.max(0, Math.min(1, bestScore / 0.40)) * 100) / 100,
    lookAheadMinutes: offsetHours * 60,
  }
}

// ─── 5. getAllScorecards ───────────────────────────────────────────────────────

/**
 * Returns all known RegionForecastScorecard rows for the intelligence API.
 */
export async function getAllScorecards(): Promise<unknown[]> {
  return (prisma as any).regionForecastScorecard.findMany({
    orderBy: { reliabilityTier: 'asc' },
  })
}
