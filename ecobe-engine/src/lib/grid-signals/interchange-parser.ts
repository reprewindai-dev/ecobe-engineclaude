/**
 * EIA-930 INTERCHANGE Parser
 *
 * Parses raw EIA930InterchangeRow arrays (from the /electricity/rto/interchange-data endpoint)
 * into InterchangeSummary objects per BA per hour.
 *
 * EIA-930 interchange: directional power flows between balancing authorities (MW).
 * A positive value means net flow from fromba → toba.
 */

import { EIA930Client } from '../eia930-client'
import type { EIA930InterchangeRow, InterchangeSummary } from './types'
import { baCodeToRegion } from './region-map'

/**
 * Parse interchange rows for a single origin BA into an InterchangeSummary.
 * Uses the most recent period present in the rows.
 */
export function parseInterchangeRows(
  rows: EIA930InterchangeRow[],
  baCode: string,
): InterchangeSummary | null {
  const baRows = rows.filter((r) => r.fromba === baCode || r.toba === baCode)
  if (!baRows.length) return null

  // Pick most recent period
  const periods = [...new Set(baRows.map((r) => r.period))].sort().reverse()
  const latestPeriod = periods[0]
  const latestRows = baRows.filter((r) => r.period === latestPeriod)

  const imports: Record<string, number> = {}
  const exports: Record<string, number> = {}

  for (const row of latestRows) {
    if (row.value == null) continue
    if (row.fromba === baCode) {
      // This BA is exporting to toba
      exports[row.toba] = (exports[row.toba] ?? 0) + row.value
    } else if (row.toba === baCode) {
      // This BA is importing from fromba
      imports[row.fromba] = (imports[row.fromba] ?? 0) + row.value
    }
  }

  const totalImportMw = Object.values(imports).reduce((s, v) => s + v, 0)
  const totalExportMw = Object.values(exports).reduce((s, v) => s + v, 0)
  const netImportMw = totalImportMw - totalExportMw

  const region = baCodeToRegion(baCode) ?? baCode

  return {
    region,
    balancingAuthority: baCode,
    timestamp: EIA930Client.periodToISO(latestPeriod),
    imports,
    exports,
    totalImportMw,
    totalExportMw,
    netImportMw,
  }
}

/**
 * Parse interchange rows grouped by origin BA.
 * Returns one InterchangeSummary per distinct fromba found.
 */
export function parseInterchangeByBA(
  rows: EIA930InterchangeRow[],
): Map<string, InterchangeSummary> {
  const baCodes = new Set<string>(rows.map((r) => r.fromba))
  const result = new Map<string, InterchangeSummary>()
  for (const baCode of baCodes) {
    const summary = parseInterchangeRows(rows, baCode)
    if (summary) result.set(baCode, summary)
  }
  return result
}

/**
 * Get the top import sources for a BA, sorted by volume descending.
 */
export function topImportSources(
  summary: InterchangeSummary,
  limit = 3,
): Array<{ baCode: string; mw: number }> {
  return Object.entries(summary.imports)
    .map(([baCode, mw]) => ({ baCode, mw }))
    .sort((a, b) => b.mw - a.mw)
    .slice(0, limit)
}

/**
 * Compute the import dependency ratio: imports / (imports + local generation).
 * Requires both interchange and balance data.
 * Returns null if demand is missing or zero.
 */
export function importDependencyRatio(
  interchange: InterchangeSummary,
  demandMwh: number | null,
): number | null {
  if (!demandMwh || demandMwh <= 0) return null
  if (interchange.totalImportMw <= 0) return 0
  return Math.min(interchange.totalImportMw / demandMwh, 1)
}
