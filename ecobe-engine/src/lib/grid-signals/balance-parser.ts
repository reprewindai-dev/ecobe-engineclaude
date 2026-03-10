/**
 * EIA-930 BALANCE Parser
 *
 * Parses raw EIA930BalanceRow arrays (from the /electricity/rto/region-data endpoint)
 * into BalanceSummary objects per BA per hour.
 *
 * BALANCE record types:
 *   D   → Demand (MWh)
 *   DF  → Demand Forecast (MWh)
 *   NG  → Net Generation (MWh)
 *   TI  → Total Interchange (MWh) — positive = net export
 */

import { EIA930Client } from '../eia930-client'
import type { EIA930BalanceRow, BalanceSummary } from './types'
import { baCodeToRegion } from './region-map'

/**
 * Parse an array of raw BALANCE rows for a single BA into a BalanceSummary.
 *
 * Rows are expected to all belong to the same BA and the same period.
 * If multiple periods are present, the most recent is used.
 */
export function parseBalanceRows(rows: EIA930BalanceRow[]): BalanceSummary | null {
  if (!rows.length) return null

  // Group by period, pick most recent
  const byPeriod = new Map<string, EIA930BalanceRow[]>()
  for (const row of rows) {
    const existing = byPeriod.get(row.period) ?? []
    existing.push(row)
    byPeriod.set(row.period, existing)
  }

  // Sort periods descending, pick latest
  const sortedPeriods = [...byPeriod.keys()].sort().reverse()
  const latestPeriod = sortedPeriods[0]
  const latestRows = byPeriod.get(latestPeriod)!

  // Determine the BA code from the first row
  const baCode = latestRows[0].respondent

  // Extract values by type
  let demandMwh: number | null = null
  let demandForecastMwh: number | null = null
  let netGenerationMwh: number | null = null
  let totalInterchangeMwh: number | null = null

  for (const row of latestRows) {
    if (row.value == null) continue
    switch (row.type) {
      case 'D':  demandMwh = row.value; break
      case 'DF': demandForecastMwh = row.value; break
      case 'NG': netGenerationMwh = row.value; break
      case 'TI': totalInterchangeMwh = row.value; break
    }
  }

  // Net import = -(TI) because EIA defines TI as positive = net export
  const netImportMwh = totalInterchangeMwh != null ? -totalInterchangeMwh : null

  const region = baCodeToRegion(baCode) ?? baCode

  return {
    region,
    balancingAuthority: baCode,
    timestamp: EIA930Client.periodToISO(latestPeriod),
    demandMwh,
    demandForecastMwh,
    netGenerationMwh,
    totalInterchangeMwh,
    netImportMwh,
    isEstimated: false,
  }
}

/**
 * Parse BALANCE rows grouped by BA.
 * Returns one BalanceSummary per distinct BA found in the rows.
 * Uses the most recent period for each BA.
 */
export function parseBalanceByBA(rows: EIA930BalanceRow[]): Map<string, BalanceSummary> {
  const byBA = new Map<string, EIA930BalanceRow[]>()
  for (const row of rows) {
    const existing = byBA.get(row.respondent) ?? []
    existing.push(row)
    byBA.set(row.respondent, existing)
  }

  const result = new Map<string, BalanceSummary>()
  for (const [baCode, baRows] of byBA) {
    const summary = parseBalanceRows(baRows)
    if (summary) result.set(baCode, summary)
  }
  return result
}

/**
 * Parse a time series of BALANCE rows for one BA.
 * Returns summaries ordered by ascending timestamp.
 * Useful for trend analysis (ramp detection, demand forecasting).
 */
export function parseBalanceTimeSeries(
  rows: EIA930BalanceRow[],
  baCode: string,
): BalanceSummary[] {
  const filtered = rows.filter((r) => r.respondent === baCode)
  if (!filtered.length) return []

  const byPeriod = new Map<string, EIA930BalanceRow[]>()
  for (const row of filtered) {
    const existing = byPeriod.get(row.period) ?? []
    existing.push(row)
    byPeriod.set(row.period, existing)
  }

  const result: BalanceSummary[] = []
  for (const [, periodRows] of byPeriod) {
    const summary = parseBalanceRows(periodRows)
    if (summary) result.push(summary)
  }

  // Sort ascending by timestamp
  return result.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
}
