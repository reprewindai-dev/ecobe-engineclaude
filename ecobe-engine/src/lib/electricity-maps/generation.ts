/**
 * Generation Intelligence Service
 *
 * Wraps electricity-mix and per-source endpoints.
 * Provides the generation composition of a grid zone — what fuels produced the power.
 *
 * Key use cases:
 *   - Real-time generation mix for dashboards
 *   - Source-specific tracking (solar, wind, hydro, etc.)
 *   - Historical mix analysis for trend detection
 *   - 72h mix forecasts for carbon-aware scheduling
 */

import { emClient } from './client'
import type { EM_MixBreakdown, EM_MixPoint, EM_SourcePoint, ElectricitySource } from './types'

export interface GenerationMixSnapshot {
  zone: string
  datetime: string
  updatedAt: string
  unit: string
  temporalGranularity: string
  mix: EM_MixBreakdown
  isEstimated: boolean
  estimationMethod: string | null
  /** Derived: total renewable MW (wind + solar + hydro) */
  totalRenewableMw: number
  /** Derived: total fossil MW (gas + coal + oil) */
  totalFossilMw: number
  /** Derived: renewable share 0–100 */
  renewableSharePct: number
}

function deriveMixStats(mix: EM_MixBreakdown): {
  totalRenewableMw: number
  totalFossilMw: number
  renewableSharePct: number
} {
  const renewable = (mix.solar ?? 0) + (mix.wind ?? 0) + (mix.hydro ?? 0) +
    (mix.nuclear ?? 0) + (mix.geothermal ?? 0) + (mix.biomass ?? 0) +
    (mix['hydro discharge'] ?? 0) + (mix['battery discharge'] ?? 0)
  const fossil = (mix.gas ?? 0) + (mix.coal ?? 0) + (mix.oil ?? 0)
  const total = renewable + fossil + (mix.unknown ?? 0)
  return {
    totalRenewableMw: renewable,
    totalFossilMw: fossil,
    renewableSharePct: total > 0 ? Math.round((renewable / total) * 100) : 0,
  }
}

function normalizeMixPoint(zone: string, unit: string, granularity: string, p: EM_MixPoint): GenerationMixSnapshot {
  const stats = deriveMixStats(p.mix)
  return {
    zone,
    datetime: p.datetime,
    updatedAt: p.updatedAt,
    unit,
    temporalGranularity: granularity,
    mix: p.mix,
    isEstimated: p.isEstimated ?? false,
    estimationMethod: p.estimationMethod ?? null,
    ...stats,
  }
}

/**
 * Get the current (latest) electricity generation mix for a zone.
 */
export async function getElectricityMix(zone: string): Promise<GenerationMixSnapshot | null> {
  const res = await emClient.getElectricityMixLatest(zone)
  if (!res) return null

  const points = res.data ?? res.history ?? []
  if (points.length === 0) return null

  return normalizeMixPoint(zone, res.unit, res.temporalGranularity, points[0])
}

/**
 * Get the last 24 hours of electricity mix data for a zone.
 */
export async function getElectricityMixHistory(zone: string): Promise<GenerationMixSnapshot[]> {
  const res = await emClient.getElectricityMixHistory(zone)
  if (!res) return []

  const points = res.data ?? res.history ?? []
  return points.map((p) => normalizeMixPoint(zone, res.unit, res.temporalGranularity, p))
}

/**
 * Get electricity mix for a historical date range (max 10 days at hourly granularity).
 */
export async function getElectricityMixRange(zone: string, start: Date, end: Date): Promise<GenerationMixSnapshot[]> {
  const res = await emClient.getElectricityMixPastRange(
    zone,
    start.toISOString(),
    end.toISOString(),
  )
  if (!res) return []

  const points = res.data ?? res.history ?? []
  return points.map((p) => normalizeMixPoint(zone, res.unit, res.temporalGranularity, p))
}

/**
 * Get the forecast electricity mix (up to 72h ahead).
 */
export async function getElectricityMixForecast(
  zone: string,
  horizonHours?: number,
): Promise<GenerationMixSnapshot[]> {
  const res = await emClient.getElectricityMixForecast(zone, horizonHours)
  if (!res) return []

  const points = res.data ?? res.history ?? []
  return points.map((p) => normalizeMixPoint(zone, res.unit, res.temporalGranularity, p))
}

// ─── Per-source generation ────────────────────────────────────────────────────

export interface SourceGenerationSnapshot {
  zone: string
  source: ElectricitySource
  datetime: string
  valueMw: number
  isEstimated: boolean
  estimationMethod: string | null
  temporalGranularity: string
}

function normalizeSourcePoints(
  zone: string,
  source: ElectricitySource,
  granularity: string,
  points: EM_SourcePoint[],
): SourceGenerationSnapshot[] {
  return points.map((p) => ({
    zone,
    source,
    datetime: p.datetime,
    valueMw: p.value,
    isEstimated: p.isEstimated ?? false,
    estimationMethod: p.estimationMethod ?? null,
    temporalGranularity: granularity,
  }))
}

/**
 * Get the latest generation data for a specific energy source.
 *
 * @example getSolarGeneration('DE') → latest solar MW for Germany
 */
export async function getSourceGeneration(
  zone: string,
  source: ElectricitySource,
): Promise<SourceGenerationSnapshot | null> {
  const res = await emClient.getElectricitySourceLatest(zone, source)
  if (!res) return null

  const points = res.data ?? res.history ?? []
  if (points.length === 0) return null

  const [p] = points
  return {
    zone,
    source,
    datetime: p.datetime,
    valueMw: p.value,
    isEstimated: p.isEstimated ?? false,
    estimationMethod: p.estimationMethod ?? null,
    temporalGranularity: res.temporalGranularity,
  }
}

/**
 * Get the last 24 hours of generation for a specific source.
 */
export async function getSourceGenerationHistory(
  zone: string,
  source: ElectricitySource,
): Promise<SourceGenerationSnapshot[]> {
  const res = await emClient.getElectricitySourceHistory(zone, source)
  if (!res) return []

  const points = res.data ?? res.history ?? []
  return normalizeSourcePoints(zone, source, res.temporalGranularity, points)
}

/**
 * Get forecast generation for a specific source.
 */
export async function getSourceGenerationForecast(
  zone: string,
  source: ElectricitySource,
  horizonHours?: number,
): Promise<SourceGenerationSnapshot[]> {
  const res = await emClient.getElectricitySourceForecast(zone, source, horizonHours)
  if (!res) return []

  const points = res.data ?? res.history ?? []
  return normalizeSourcePoints(zone, source, res.temporalGranularity, points)
}
