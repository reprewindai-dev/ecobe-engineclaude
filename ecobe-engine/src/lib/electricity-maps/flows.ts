/**
 * Interconnection Intelligence Service — Electricity Flows
 *
 * Cross-border power transfers significantly affect a zone's real carbon intensity.
 * A zone importing from a coal-heavy neighbour will see its effective intensity rise
 * even if its own generation is clean.
 *
 * Key use cases:
 *   - Augment carbon intensity with flow-traced accuracy
 *   - Detect hidden fossil exposure from imports
 *   - Track net import/export position for load analysis
 */

import { emClient } from './client'
import type { EM_FlowPoint } from './types'

export interface FlowSnapshot {
  zone: string
  datetime: string
  updatedAt: string
  /** MW imported from each neighbouring zone */
  imports: Record<string, number>
  /** MW exported to each neighbouring zone */
  exports: Record<string, number>
  /** Net position: positive = net importer, negative = net exporter (MW) */
  netImportMw: number
  /** Total MW crossing the border in either direction */
  totalFlowMw: number
}

function normalizeFlowPoint(zone: string, p: EM_FlowPoint): FlowSnapshot {
  const totalImport = Object.values(p.import).reduce((a, b) => a + b, 0)
  const totalExport = Object.values(p.export).reduce((a, b) => a + b, 0)
  return {
    zone,
    datetime: p.datetime,
    updatedAt: p.updatedAt,
    imports: p.import,
    exports: p.export,
    netImportMw: totalImport - totalExport,
    totalFlowMw: totalImport + totalExport,
  }
}

/**
 * Get the current electricity flows (imports/exports) for a zone.
 */
export async function getElectricityFlows(zone: string): Promise<FlowSnapshot | null> {
  const res = await emClient.getElectricityFlowsLatest(zone)
  if (!res) return null

  const points = res.data ?? res.history ?? []
  if (points.length === 0) return null

  return normalizeFlowPoint(zone, points[0])
}

/**
 * Get the last 24 hours of electricity flow data.
 */
export async function getElectricityFlowsHistory(zone: string): Promise<FlowSnapshot[]> {
  const res = await emClient.getElectricityFlowsHistory(zone)
  if (!res) return []

  const points = res.data ?? res.history ?? []
  return points.map((p) => normalizeFlowPoint(zone, p))
}

/**
 * Get electricity flows for a historical date range.
 */
export async function getElectricityFlowsRange(
  zone: string,
  start: Date,
  end: Date,
): Promise<FlowSnapshot[]> {
  const res = await emClient.getElectricityFlowsPastRange(
    zone,
    start.toISOString(),
    end.toISOString(),
  )
  if (!res) return []

  const points = res.data ?? res.history ?? []
  return points.map((p) => normalizeFlowPoint(zone, p))
}

/**
 * Get forecasted electricity flows (up to 72h ahead).
 */
export async function getElectricityFlowsForecast(
  zone: string,
  horizonHours?: number,
): Promise<FlowSnapshot[]> {
  const res = await emClient.getElectricityFlowsForecast(zone, horizonHours)
  if (!res) return []

  const points = res.data ?? res.history ?? []
  return points.map((p) => normalizeFlowPoint(zone, p))
}

/**
 * Returns a map of neighbouring zones ranked by how much power they're sending in.
 * Useful for tracing the fossil exposure of imports.
 */
export function rankImportsByVolume(snapshot: FlowSnapshot): Array<{ zone: string; mw: number }> {
  return Object.entries(snapshot.imports)
    .map(([z, mw]) => ({ zone: z, mw }))
    .sort((a, b) => b.mw - a.mw)
}
