/**
 * Load Intelligence Service — Net Load
 *
 * Net load = total grid demand − solar − wind (flow-traced).
 * It represents the demand that fossil plants must cover to maintain grid stability.
 *
 * Net load is the strongest LEADING INDICATOR of fossil generation pressure.
 * When net load increases, fossil plants ramp — carbon intensity follows 1–3 hours later.
 * This is the primary input to Kobe's fossil spike early-warning system.
 *
 * Key use cases:
 *   - Fossil spike prediction (4-signal system)
 *   - Duck curve detection (solar over-generation risk)
 *   - Grid stability analytics
 *   - Carbon-aware scheduling (run workloads when net load is low)
 */

import { emClient } from './client'
import type { EM_NetLoadPoint } from './types'

export interface NetLoadSnapshot {
  zone: string
  datetime: string
  valueMw: number
  unit: string
  source: string
  isEstimated: boolean
  estimationMethod: string | null
  temporalGranularity: string
}

function normalizeNetLoadPoint(p: EM_NetLoadPoint, granularity: string): NetLoadSnapshot {
  return {
    zone: p.zone,
    datetime: p.datetime,
    valueMw: p.value,
    unit: p.unit,
    source: p.source,
    isEstimated: p.isEstimated,
    estimationMethod: p.estimationMethod,
    temporalGranularity: granularity,
  }
}

/**
 * Get the current net load for a zone.
 */
export async function getNetLoad(zone: string): Promise<NetLoadSnapshot | null> {
  const res = await emClient.getNetLoadLatest(zone)
  if (!res) return null

  return {
    zone: res.zone,
    datetime: res.datetime,
    valueMw: res.value,
    unit: res.unit,
    source: res.source,
    isEstimated: res.isEstimated,
    estimationMethod: res.estimationMethod,
    temporalGranularity: res.temporalGranularity,
  }
}

/**
 * Get the last 24 hours of net load data.
 */
export async function getNetLoadHistory(zone: string): Promise<NetLoadSnapshot[]> {
  const res = await emClient.getNetLoadHistory(zone)
  if (!res) return []

  const points = res.data ?? res.history ?? []
  const granularity = res.temporalGranularity ?? 'hourly'
  return points.map((p) => normalizeNetLoadPoint(p, granularity))
}

/**
 * Get net load for a historical date range (max 10 days at hourly granularity).
 */
export async function getNetLoadRange(zone: string, start: Date, end: Date): Promise<NetLoadSnapshot[]> {
  const res = await emClient.getNetLoadPastRange(zone, start.toISOString(), end.toISOString())
  if (!res) return []

  const points = res.data ?? res.history ?? []
  const granularity = res.temporalGranularity ?? 'hourly'
  return points.map((p) => normalizeNetLoadPoint(p, granularity))
}

/**
 * Get forecasted net load (up to 72h ahead).
 */
export async function getNetLoadForecast(zone: string, horizonHours?: number): Promise<NetLoadSnapshot[]> {
  const res = await emClient.getNetLoadForecast(zone, horizonHours)
  if (!res) return []

  const points = res.data ?? res.history ?? []
  const granularity = res.temporalGranularity ?? 'hourly'
  return points.map((p) => normalizeNetLoadPoint(p, granularity))
}

/**
 * Compute the delta (rate of change) between two net load readings.
 * Positive delta = net load increasing → fossil pressure building.
 */
export function netLoadDelta(current: NetLoadSnapshot, previous: NetLoadSnapshot): number {
  return current.valueMw - previous.valueMw
}

/**
 * Classify net load trend given a series of readings (most recent first).
 */
export function classifyNetLoadTrend(
  readings: NetLoadSnapshot[],
): 'rising' | 'falling' | 'stable' {
  if (readings.length < 2) return 'stable'
  const delta = readings[0].valueMw - readings[readings.length - 1].valueMw
  if (delta > 500) return 'rising'
  if (delta < -500) return 'falling'
  return 'stable'
}
