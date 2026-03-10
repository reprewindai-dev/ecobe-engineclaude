/**
 * Grid Signal Intelligence — Parser Tests
 *
 * Tests for:
 *   - balance-parser: EIA930BalanceRow → BalanceSummary
 *   - interchange-parser: EIA930InterchangeRow → InterchangeSummary
 *   - subregion-parser: EIA930SubregionRow → FuelMixSummary
 *   - ramp-detector: BalanceSummary[] → DemandRampSignal
 *   - curtailment-detector: signal inputs → CurtailmentSignal
 *   - interchange-analyzer: InterchangeSummary → InterchangeLeakageSignal
 *
 * All tests use synthetic EIA-930 data — no network calls.
 */

import { parseBalanceRows, parseBalanceByBA, parseBalanceTimeSeries } from '../balance-parser'
import { parseInterchangeRows, parseInterchangeByBA } from '../interchange-parser'
import { parseSubregionRows, renewableRatioTrend } from '../subregion-parser'
import { detectDemandRamp, classifyRamp } from '../ramp-detector'
import { detectCurtailment } from '../curtailment-detector'
import { analyzeInterchangeLeakage } from '../interchange-analyzer'
import type { EIA930BalanceRow, EIA930InterchangeRow, EIA930SubregionRow } from '../types'

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeBalanceRow(
  overrides: Partial<EIA930BalanceRow> = {},
): EIA930BalanceRow {
  return {
    period: '2026-03-09T18',
    respondent: 'MIDA',
    respondentName: 'PJM Interconnection',
    type: 'D',
    typeName: 'Demand',
    timezone: 'Eastern',
    value: 100_000,
    valueUnits: 'megawatthours',
    ...overrides,
  }
}

function makeInterchangeRow(
  overrides: Partial<EIA930InterchangeRow> = {},
): EIA930InterchangeRow {
  return {
    period: '2026-03-09T18',
    fromba: 'MIDA',
    frombaName: 'PJM',
    toba: 'NE',
    tobaName: 'ISO NE',
    timezone: 'Eastern',
    value: 500,
    valueUnits: 'megawatthours',
    ...overrides,
  }
}

function makeSubregionRow(
  overrides: Partial<EIA930SubregionRow> = {},
): EIA930SubregionRow {
  return {
    period: '2026-03-09T18',
    respondent: 'MIDA',
    respondentName: 'PJM Interconnection',
    fueltype: 'NG',
    typeName: 'Natural Gas',
    timezone: 'Eastern',
    value: 50_000,
    valueUnits: 'megawatthours',
    ...overrides,
  }
}

// ─── Balance Parser ───────────────────────────────────────────────────────────

describe('parseBalanceRows', () => {
  it('returns null for empty input', () => {
    expect(parseBalanceRows([])).toBeNull()
  })

  it('extracts demand, netGeneration, totalInterchange values', () => {
    const rows = [
      makeBalanceRow({ type: 'D', value: 80_000 }),
      makeBalanceRow({ type: 'NG', value: 75_000 }),
      makeBalanceRow({ type: 'TI', value: -5_000 }),
    ]
    const result = parseBalanceRows(rows)
    expect(result).not.toBeNull()
    expect(result!.demandMwh).toBe(80_000)
    expect(result!.netGenerationMwh).toBe(75_000)
    expect(result!.totalInterchangeMwh).toBe(-5_000)
    // netImportMwh = -TI (positive TI = net export)
    expect(result!.netImportMwh).toBe(5_000)
  })

  it('maps BA code to ECOBE region', () => {
    const result = parseBalanceRows([makeBalanceRow({ respondent: 'MIDA' })])
    expect(result!.region).toBe('US-MIDA-PJM')
    expect(result!.balancingAuthority).toBe('MIDA')
  })

  it('picks most recent period when multiple periods present', () => {
    const rows = [
      makeBalanceRow({ period: '2026-03-09T16', type: 'D', value: 60_000 }),
      makeBalanceRow({ period: '2026-03-09T17', type: 'D', value: 70_000 }),
      makeBalanceRow({ period: '2026-03-09T18', type: 'D', value: 80_000 }),
    ]
    const result = parseBalanceRows(rows)
    expect(result!.demandMwh).toBe(80_000)
    expect(result!.timestamp).toContain('2026-03-09T18')
  })

  it('handles null values gracefully', () => {
    const rows = [makeBalanceRow({ value: null })]
    const result = parseBalanceRows(rows)
    expect(result).not.toBeNull()
    expect(result!.demandMwh).toBeNull()
  })

  it('converts period to ISO-8601', () => {
    const result = parseBalanceRows([makeBalanceRow()])
    expect(result!.timestamp).toBe('2026-03-09T18:00:00Z')
  })
})

describe('parseBalanceByBA', () => {
  it('groups rows by BA code', () => {
    const rows = [
      makeBalanceRow({ respondent: 'MIDA', type: 'D', value: 100_000 }),
      makeBalanceRow({ respondent: 'CAL', type: 'D', value: 30_000 }),
    ]
    const map = parseBalanceByBA(rows)
    expect(map.size).toBe(2)
    expect(map.get('MIDA')!.demandMwh).toBe(100_000)
    expect(map.get('CAL')!.demandMwh).toBe(30_000)
  })
})

describe('parseBalanceTimeSeries', () => {
  it('returns ascending ordered time series for one BA', () => {
    const rows = [
      makeBalanceRow({ period: '2026-03-09T18', type: 'D', value: 80_000 }),
      makeBalanceRow({ period: '2026-03-09T16', type: 'D', value: 60_000 }),
      makeBalanceRow({ period: '2026-03-09T17', type: 'D', value: 70_000 }),
    ]
    const series = parseBalanceTimeSeries(rows, 'MIDA')
    expect(series).toHaveLength(3)
    expect(series[0].demandMwh).toBe(60_000)
    expect(series[2].demandMwh).toBe(80_000)
  })

  it('returns empty array for unknown BA', () => {
    const series = parseBalanceTimeSeries([], 'UNKNOWN')
    expect(series).toHaveLength(0)
  })
})

// ─── Interchange Parser ───────────────────────────────────────────────────────

describe('parseInterchangeRows', () => {
  it('returns null when no rows match the BA', () => {
    expect(parseInterchangeRows([], 'MIDA')).toBeNull()
  })

  it('correctly classifies exports vs imports', () => {
    const rows = [
      makeInterchangeRow({ fromba: 'MIDA', toba: 'NE', value: 500 }),     // export
      makeInterchangeRow({ fromba: 'CAL', toba: 'MIDA', value: 300 }),    // import
    ]
    const result = parseInterchangeRows(rows, 'MIDA')
    expect(result!.exports['NE']).toBe(500)
    expect(result!.imports['CAL']).toBe(300)
    expect(result!.totalExportMw).toBe(500)
    expect(result!.totalImportMw).toBe(300)
    expect(result!.netImportMw).toBe(-200)  // net exporter
  })

  it('returns correct region mapping', () => {
    const result = parseInterchangeRows([makeInterchangeRow({ fromba: 'MIDA' })], 'MIDA')
    expect(result!.region).toBe('US-MIDA-PJM')
  })
})

describe('parseInterchangeByBA', () => {
  it('creates one summary per distinct fromba', () => {
    const rows = [
      makeInterchangeRow({ fromba: 'MIDA', toba: 'NE', value: 200 }),
      makeInterchangeRow({ fromba: 'CAL', toba: 'NW', value: 300 }),
    ]
    const map = parseInterchangeByBA(rows)
    expect(map.size).toBe(2)
    expect(map.has('MIDA')).toBe(true)
    expect(map.has('CAL')).toBe(true)
  })
})

// ─── Subregion Parser ─────────────────────────────────────────────────────────

describe('parseSubregionRows', () => {
  it('returns null for empty input', () => {
    expect(parseSubregionRows([])).toBeNull()
  })

  it('aggregates fuel types correctly', () => {
    const rows = [
      makeSubregionRow({ fueltype: 'SUN', value: 20_000 }),
      makeSubregionRow({ fueltype: 'WND', value: 10_000 }),
      makeSubregionRow({ fueltype: 'NG', value: 50_000 }),
      makeSubregionRow({ fueltype: 'COL', value: 20_000 }),
    ]
    const result = parseSubregionRows(rows)
    expect(result).not.toBeNull()
    expect(result!.byFuel.solar).toBe(20_000)
    expect(result!.byFuel.wind).toBe(10_000)
    expect(result!.byFuel.naturalGas).toBe(50_000)
    expect(result!.byFuel.coal).toBe(20_000)
    expect(result!.totalMwh).toBe(100_000)
  })

  it('computes renewable and fossil ratios correctly', () => {
    const rows = [
      makeSubregionRow({ fueltype: 'SUN', value: 40_000 }),
      makeSubregionRow({ fueltype: 'NG', value: 60_000 }),
    ]
    const result = parseSubregionRows(rows)!
    expect(result.renewableRatio).toBeCloseTo(0.4)
    expect(result.fossilRatio).toBeCloseTo(0.6)
  })

  it('ignores null values', () => {
    const rows = [
      makeSubregionRow({ fueltype: 'SUN', value: null }),
      makeSubregionRow({ fueltype: 'NG', value: 50_000 }),
    ]
    const result = parseSubregionRows(rows)!
    expect(result.byFuel.solar).toBe(0)
    expect(result.totalMwh).toBe(50_000)
  })

  it('returns null when all values are null', () => {
    const rows = [makeSubregionRow({ value: null })]
    expect(parseSubregionRows(rows)).toBeNull()
  })
})

describe('renewableRatioTrend', () => {
  it('returns stable for empty series', () => {
    const result = renewableRatioTrend([])
    expect(result.direction).toBe('stable')
    expect(result.current).toBeNull()
  })

  it('detects rising renewable ratio', () => {
    const makeRow = (renewableRatio: number, ts: string) => ({
      region: 'US-MIDA-PJM',
      balancingAuthority: 'MIDA',
      timestamp: ts,
      byFuel: { solar: 0, wind: 0, hydro: 0, nuclear: 0, naturalGas: 0, coal: 0, oil: 0, other: 0 },
      totalMwh: 100,
      renewableRatio,
      fossilRatio: 1 - renewableRatio,
      isEstimated: false,
    })
    const series = [makeRow(0.30, '2026-03-09T16:00:00Z'), makeRow(0.55, '2026-03-09T17:00:00Z')]
    const result = renewableRatioTrend(series)
    expect(result.direction).toBe('rising')
    expect(result.current).toBeCloseTo(0.55)
  })
})

// ─── Ramp Detector ────────────────────────────────────────────────────────────

describe('detectDemandRamp', () => {
  const makeBalance = (demand: number, ts: string) => ({
    region: 'US-MIDA-PJM',
    balancingAuthority: 'MIDA',
    timestamp: ts,
    demandMwh: demand,
    demandForecastMwh: null,
    netGenerationMwh: null,
    totalInterchangeMwh: null,
    netImportMwh: null,
    isEstimated: false,
  })

  it('returns null for single-point series', () => {
    expect(detectDemandRamp([makeBalance(50_000, '2026-03-09T18:00:00Z')])).toBeNull()
  })

  it('detects rising demand', () => {
    const series = [
      makeBalance(40_000, '2026-03-09T15:00:00Z'),
      makeBalance(44_000, '2026-03-09T18:00:00Z'),
    ]
    const result = detectDemandRamp(series)!
    expect(result.direction).toBe('rising')
    expect(result.demandChangeMwh).toBe(4_000)
  })

  it('detects falling demand', () => {
    const series = [
      makeBalance(50_000, '2026-03-09T15:00:00Z'),
      makeBalance(45_000, '2026-03-09T18:00:00Z'),
    ]
    const result = detectDemandRamp(series)!
    expect(result.direction).toBe('falling')
  })

  it('classifies stable demand (< 200 MW change)', () => {
    const series = [
      makeBalance(50_000, '2026-03-09T15:00:00Z'),
      makeBalance(50_100, '2026-03-09T18:00:00Z'),
    ]
    const result = detectDemandRamp(series)!
    expect(result.direction).toBe('stable')
  })

  it('strength is normalized to 0–1', () => {
    const series = [
      makeBalance(0, '2026-03-09T15:00:00Z'),
      makeBalance(3_000, '2026-03-09T18:00:00Z'),
    ]
    const result = detectDemandRamp(series)!
    expect(result.strength).toBe(1)  // 3000 MW = full strength
  })
})

describe('classifyRamp', () => {
  it('classifies 2000 MW rise as rising', () => {
    const r = classifyRamp(52_000, 50_000)
    expect(r.direction).toBe('rising')
    expect(r.changeMwh).toBe(2_000)
  })

  it('classifies 50 MW change as stable', () => {
    const r = classifyRamp(50_050, 50_000)
    expect(r.direction).toBe('stable')
  })
})

// ─── Curtailment Detector ─────────────────────────────────────────────────────

describe('detectCurtailment', () => {
  const baseBalance = {
    region: 'US-CAL-CISO',
    balancingAuthority: 'CAL',
    timestamp: '2026-03-09T18:00:00Z',
    demandMwh: 25_000,
    demandForecastMwh: null,
    netGenerationMwh: null,
    totalInterchangeMwh: null,
    netImportMwh: null,
    isEstimated: false,
  }

  it('returns null when balance is null', () => {
    expect(detectCurtailment({ balance: null, previousBalance: null, fuelMix: null, interchange: null })).toBeNull()
  })

  it('high renewable ratio + demand falling + export pressure → high curtailment probability', () => {
    const prevBalance = { ...baseBalance, demandMwh: 28_000, timestamp: '2026-03-09T17:00:00Z' }
    const fuelMix = {
      region: 'US-CAL-CISO',
      balancingAuthority: 'CAL',
      timestamp: '2026-03-09T18:00:00Z',
      byFuel: { solar: 0, wind: 0, hydro: 0, nuclear: 0, naturalGas: 0, coal: 0, oil: 0, other: 0 },
      totalMwh: 30_000,
      renewableRatio: 0.80,
      fossilRatio: 0.05,
      isEstimated: false,
    }
    const interchange = {
      region: 'US-CAL-CISO',
      balancingAuthority: 'CAL',
      timestamp: '2026-03-09T18:00:00Z',
      imports: {},
      exports: { 'NW': 2_000 },
      totalImportMw: 0,
      totalExportMw: 2_000,
      netImportMw: -2_000,   // net exporter
    }

    const result = detectCurtailment({
      balance: baseBalance,
      previousBalance: prevBalance,
      fuelMix,
      interchange,
    })!

    expect(result.curtailmentProbability).toBeGreaterThan(0.5)
    expect(result.drivers.demandFalling).toBe(true)
    expect(result.drivers.highRenewableRatio).toBe(true)
    expect(result.drivers.exportPressure).toBe(true)
    expect(result.drivers.lowFossilDependency).toBe(true)
  })

  it('no signals → low probability', () => {
    const result = detectCurtailment({ balance: baseBalance, previousBalance: null, fuelMix: null, interchange: null })!
    expect(result.curtailmentProbability).toBeLessThan(0.1)
  })
})

// ─── Interchange Leakage Analyzer ─────────────────────────────────────────────

describe('analyzeInterchangeLeakage', () => {
  const baseInterchange = {
    region: 'US-NE-ISNE',
    balancingAuthority: 'NE',
    timestamp: '2026-03-09T18:00:00Z',
    imports: { 'MIDA': 1_500 },
    exports: {},
    totalImportMw: 1_500,
    totalExportMw: 0,
    netImportMw: 1_500,
  }

  it('computes leakage score from dependency ratio', () => {
    const balance = {
      region: 'US-NE-ISNE',
      balancingAuthority: 'NE',
      timestamp: '2026-03-09T18:00:00Z',
      demandMwh: 10_000,
      demandForecastMwh: null,
      netGenerationMwh: null,
      totalInterchangeMwh: null,
      netImportMwh: null,
      isEstimated: false,
    }

    const result = analyzeInterchangeLeakage(baseInterchange, balance)
    // 1500/10000 = 0.15 dependency + some volume boost
    expect(result.importCarbonLeakageScore).toBeGreaterThan(0)
    expect(result.isNetImporter).toBe(true)
    expect(result.topImportSource).toBe('MIDA')
  })

  it('net exporter has zero leakage', () => {
    const exporter = {
      ...baseInterchange,
      imports: {},
      exports: { 'NE': 500 },
      totalImportMw: 0,
      totalExportMw: 500,
      netImportMw: -500,
    }
    const result = analyzeInterchangeLeakage(exporter, null)
    expect(result.importCarbonLeakageScore).toBe(0)
    expect(result.isNetImporter).toBe(false)
  })
})
