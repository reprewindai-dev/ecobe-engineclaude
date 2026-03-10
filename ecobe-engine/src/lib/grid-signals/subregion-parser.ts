/**
 * EIA-930 SUBREGION Parser
 *
 * Parses raw EIA930SubregionRow arrays (from the /electricity/rto/region-sub-ba-data endpoint)
 * into FuelMixSummary objects per BA per hour.
 *
 * The SUBREGION endpoint gives generation by fuel type within each balancing authority.
 * Fuel codes: SUN (solar), WND (wind), WAT (hydro), NUC (nuclear),
 *             NG (natural gas), COL (coal), OIL (oil), OTH (other)
 */

import { EIA930Client } from '../eia930-client'
import type { EIA930SubregionRow, FuelMixSummary } from './types'
import { baCodeToRegion, normalizeFuelCode } from './region-map'

const RENEWABLE_FUELS = new Set<keyof FuelMixSummary['byFuel']>(['solar', 'wind', 'hydro', 'nuclear'])
const FOSSIL_FUELS = new Set<keyof FuelMixSummary['byFuel']>(['naturalGas', 'coal', 'oil'])

/**
 * Parse subregion rows for a single BA into a FuelMixSummary.
 * Uses the most recent period present in the rows.
 */
export function parseSubregionRows(rows: EIA930SubregionRow[]): FuelMixSummary | null {
  if (!rows.length) return null

  // Group by period, pick most recent
  const periods = [...new Set(rows.map((r) => r.period))].sort().reverse()
  const latestPeriod = periods[0]
  const latestRows = rows.filter((r) => r.period === latestPeriod)

  const baCode = latestRows[0].respondent

  // Aggregate MWh by normalized fuel type
  const byFuel: FuelMixSummary['byFuel'] = {
    solar: 0,
    wind: 0,
    hydro: 0,
    nuclear: 0,
    naturalGas: 0,
    coal: 0,
    oil: 0,
    other: 0,
  }

  let hasData = false
  for (const row of latestRows) {
    if (row.value == null || row.value < 0) continue
    const fuel = normalizeFuelCode(row.fueltype)
    if (fuel) {
      byFuel[fuel] += row.value
      hasData = true
    }
  }

  if (!hasData) return null

  const totalMwh = Object.values(byFuel).reduce((s, v) => s + v, 0)

  const renewableMwh = [...RENEWABLE_FUELS].reduce((s, f) => s + byFuel[f], 0)
  const fossilMwh = [...FOSSIL_FUELS].reduce((s, f) => s + byFuel[f], 0)

  const renewableRatio = totalMwh > 0 ? renewableMwh / totalMwh : 0
  const fossilRatio = totalMwh > 0 ? fossilMwh / totalMwh : 0

  const region = baCodeToRegion(baCode) ?? baCode

  return {
    region,
    balancingAuthority: baCode,
    timestamp: EIA930Client.periodToISO(latestPeriod),
    byFuel,
    totalMwh,
    renewableRatio,
    fossilRatio,
    isEstimated: false,
  }
}

/**
 * Parse subregion rows grouped by BA.
 * Returns one FuelMixSummary per distinct BA.
 */
export function parseSubregionByBA(rows: EIA930SubregionRow[]): Map<string, FuelMixSummary> {
  const byBA = new Map<string, EIA930SubregionRow[]>()
  for (const row of rows) {
    const existing = byBA.get(row.respondent) ?? []
    existing.push(row)
    byBA.set(row.respondent, existing)
  }

  const result = new Map<string, FuelMixSummary>()
  for (const [baCode, baRows] of byBA) {
    const summary = parseSubregionRows(baRows)
    if (summary) result.set(baCode, summary)
  }
  return result
}

/**
 * Parse a time series of subregion rows for one BA.
 * Returns FuelMixSummary[] ordered by ascending timestamp.
 * Useful for computing renewable ratio trend.
 */
export function parseSubregionTimeSeries(
  rows: EIA930SubregionRow[],
  baCode: string,
): FuelMixSummary[] {
  const filtered = rows.filter((r) => r.respondent === baCode)
  if (!filtered.length) return []

  const byPeriod = new Map<string, EIA930SubregionRow[]>()
  for (const row of filtered) {
    const existing = byPeriod.get(row.period) ?? []
    existing.push(row)
    byPeriod.set(row.period, existing)
  }

  const result: FuelMixSummary[] = []
  for (const [, periodRows] of byPeriod) {
    const summary = parseSubregionRows(periodRows)
    if (summary) result.push(summary)
  }

  return result.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
}

/**
 * Get the renewable ratio trend from a time series.
 * Returns { current, previous, delta, direction }.
 */
export function renewableRatioTrend(timeSeries: FuelMixSummary[]): {
  current: number | null
  previous: number | null
  delta: number | null
  direction: 'rising' | 'falling' | 'stable'
} {
  if (timeSeries.length === 0) {
    return { current: null, previous: null, delta: null, direction: 'stable' }
  }
  const current = timeSeries[timeSeries.length - 1].renewableRatio
  const previous = timeSeries.length >= 2 ? timeSeries[timeSeries.length - 2].renewableRatio : null
  const delta = previous != null ? current - previous : null
  const direction =
    delta == null ? 'stable'
    : delta > 0.02 ? 'rising'
    : delta < -0.02 ? 'falling'
    : 'stable'

  return { current, previous, delta, direction }
}
