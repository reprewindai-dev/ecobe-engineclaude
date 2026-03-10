/**
 * Level Signals Service — Carbon / Renewable / Carbon-Free Levels
 *
 * Level signals (high / moderate / low) show how the current hour compares
 * to a rolling 10-day average for that zone.  They are relative, not absolute.
 *
 * Thresholds (same for all three signals):
 *   low      → ratio < 0.85   (>15% below average)
 *   moderate → 0.85 ≤ ratio ≤ 1.15
 *   high     → ratio > 1.15   (>15% above average)
 *
 * Key use cases:
 *   - Simple green/amber/red traffic light for UIs
 *   - Trigger compute scheduling decisions without needing absolute thresholds
 *   - Alerts and notifications when grid is unusually dirty or clean
 *
 * These endpoints are the fastest way to add smart scheduling:
 *   if carbonLevel === 'low' → run now
 *   if carbonLevel === 'high' → defer
 */

import { emClient } from './client'
import type { CarbonLevel } from './types'

export interface LevelSnapshot {
  zone: string
  signal: 'carbon_intensity' | 'renewable_percentage' | 'carbon_free_percentage'
  level: CarbonLevel
  datetime: string
}

export interface ZoneLevelSummary {
  zone: string
  evaluatedAt: string
  carbonIntensityLevel?: CarbonLevel
  renewablePercentageLevel?: CarbonLevel
  carbonFreePercentageLevel?: CarbonLevel
  /** Composite green signal: true if all available signals are low/moderate */
  isGreenWindow: boolean
  /** Composite dirty signal: true if carbon intensity is high */
  isDirtyWindow: boolean
}

/**
 * Get the current carbon intensity level (high/moderate/low) for a zone.
 */
export async function getCarbonIntensityLevel(zone: string): Promise<LevelSnapshot | null> {
  const res = await emClient.getCarbonIntensityLevel(zone)
  if (!res || !res.data?.length) return null

  return {
    zone: res.zone,
    signal: 'carbon_intensity',
    level: res.data[0].level,
    datetime: res.data[0].datetime,
  }
}

/**
 * Get the current renewable percentage level for a zone.
 */
export async function getRenewablePercentageLevel(zone: string): Promise<LevelSnapshot | null> {
  const res = await emClient.getRenewablePercentageLevel(zone)
  if (!res || !res.data?.length) return null

  return {
    zone: res.zone,
    signal: 'renewable_percentage',
    level: res.data[0].level,
    datetime: res.data[0].datetime,
  }
}

/**
 * Get the current carbon-free energy percentage level for a zone.
 */
export async function getCarbonFreePercentageLevel(zone: string): Promise<LevelSnapshot | null> {
  const res = await emClient.getCarbonFreePercentageLevel(zone)
  if (!res || !res.data?.length) return null

  return {
    zone: res.zone,
    signal: 'carbon_free_percentage',
    level: res.data[0].level,
    datetime: res.data[0].datetime,
  }
}

/**
 * Fetch all three level signals for a zone and return a composite summary.
 * Uses Promise.allSettled so a missing signal doesn't block the others.
 */
export async function getZoneLevelSummary(zone: string): Promise<ZoneLevelSummary> {
  const [carbonRes, renewableRes, carbonFreeRes] = await Promise.allSettled([
    getCarbonIntensityLevel(zone),
    getRenewablePercentageLevel(zone),
    getCarbonFreePercentageLevel(zone),
  ])

  const carbonLevel = carbonRes.status === 'fulfilled' ? carbonRes.value?.level : undefined
  const renewableLevel = renewableRes.status === 'fulfilled' ? renewableRes.value?.level : undefined
  const carbonFreeLevel = carbonFreeRes.status === 'fulfilled' ? carbonFreeRes.value?.level : undefined

  const isGreenWindow =
    carbonLevel !== 'high' &&
    (renewableLevel === 'high' || renewableLevel === 'moderate') &&
    carbonLevel !== undefined

  const isDirtyWindow = carbonLevel === 'high'

  return {
    zone,
    evaluatedAt: new Date().toISOString(),
    carbonIntensityLevel: carbonLevel,
    renewablePercentageLevel: renewableLevel,
    carbonFreePercentageLevel: carbonFreeLevel,
    isGreenWindow,
    isDirtyWindow,
  }
}

/**
 * Quick check: is this zone in a green scheduling window right now?
 * Returns true if carbon intensity is low or moderate.
 */
export async function isGreenSchedulingWindow(zone: string): Promise<boolean> {
  const level = await getCarbonIntensityLevel(zone)
  if (!level) return false
  return level.level !== 'high'
}
