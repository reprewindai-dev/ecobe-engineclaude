/**
 * Carbon Window Prediction — probabilistic clean-energy window detector.
 *
 * Uses forecast data stored in CarbonForecast + regional reliability from
 * RegionForecastScorecard to estimate whether any candidate region is likely
 * to become meaningfully cleaner in the near future.
 *
 * Algorithm:
 *   1. Pull the next 2-hour forecast slots for all candidate regions.
 *   2. Find the lowest projected intensity for each region across those slots.
 *   3. If the projected minimum drops >20% below the current winning intensity,
 *      and forecast reliability is medium or above, emit a window prediction.
 *   4. Probability is scaled by reliability tier (high=0.85, medium=0.65, low=0.40).
 *
 * Returned as `predicted_clean_window` in the routing response.
 * Returns null if no meaningful drop is predicted or data is insufficient.
 */

import { prisma } from './db'
import { getRegionScorecard } from './forecast-scorecard'

// Minimum intensity drop (relative) to consider a window meaningful
const DROP_THRESHOLD = 0.20

// Probability weights by forecast reliability
const RELIABILITY_PROB: Record<string, number> = {
  high:    0.85,
  medium:  0.65,
  low:     0.40,
  unknown: 0.35,
}

export interface CleanWindowPrediction {
  region: string
  current_intensity: number
  predicted_intensity: number
  drop_pct: number
  drop_probability: number
  expected_minutes: number
  reliability_tier: string
}

/**
 * Returns a window prediction if a candidate region is likely to become
 * significantly cleaner within the next 2 hours, or null otherwise.
 */
export async function predictCleanWindow(
  candidateRegions: string[],
  currentWinner: string,
  currentIntensity: number,
): Promise<CleanWindowPrediction | null> {
  const horizon = new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours out
  const now = new Date()

  // Fetch upcoming forecast slots for all candidates in one query
  const forecasts = await (prisma as any).carbonForecast.findMany({
    where: {
      region: { in: candidateRegions },
      forecastTime: { gte: now, lte: horizon },
    },
    select: {
      region: true,
      forecastTime: true,
      forecastedIntensity: true,
    },
    orderBy: { forecastTime: 'asc' },
  }).catch(() => [] as any[])

  if (!forecasts.length) return null

  // Group by region
  const byRegion = new Map<string, Array<{ forecastTime: Date; forecastedIntensity: number }>>()
  for (const f of forecasts) {
    if (!byRegion.has(f.region)) byRegion.set(f.region, [])
    byRegion.get(f.region)!.push(f)
  }

  // Find the best (lowest) predicted intensity across all candidates
  let bestPrediction: CleanWindowPrediction | null = null

  for (const [region, slots] of byRegion.entries()) {
    // Find the slot with the minimum forecasted intensity
    const minSlot = slots.reduce((best, s) =>
      s.forecastedIntensity < best.forecastedIntensity ? s : best,
    )

    const drop = (currentIntensity - minSlot.forecastedIntensity) / currentIntensity

    if (drop < DROP_THRESHOLD) continue // not a meaningful improvement

    const scorecard = await getRegionScorecard(region).catch(() => null)
    const tier = scorecard?.reliabilityTier ?? 'unknown'
    const probability = RELIABILITY_PROB[tier] ?? RELIABILITY_PROB.unknown

    const minutesUntil = Math.round((minSlot.forecastTime.getTime() - now.getTime()) / 60_000)

    const candidate: CleanWindowPrediction = {
      region,
      current_intensity: currentIntensity,
      predicted_intensity: Math.round(minSlot.forecastedIntensity),
      drop_pct: Math.round(drop * 100),
      drop_probability: probability,
      expected_minutes: Math.max(0, minutesUntil),
      reliability_tier: tier,
    }

    // Prefer the prediction with the largest expected drop × probability
    const score = drop * probability
    const bestScore = bestPrediction
      ? (bestPrediction.drop_pct / 100) * bestPrediction.drop_probability
      : -1

    if (score > bestScore) bestPrediction = candidate
  }

  return bestPrediction
}
