/**
 * Grid Signal Intelligence — Type Definitions
 *
 * All types for the Grid Signal Intelligence Layer that combines:
 *   - WattTime MOER + forecast (causal routing signal, fast path)
 *   - Electricity Maps flow-traced intelligence
 *   - Ember validation + historical enrichment
 *   - EIA-930 BALANCE / INTERCHANGE / SUBREGION (predictive telemetry)
 *
 * THE ARCHITECTURAL RULE:
 *   GridSignalSnapshot is a READ-ONLY enrichment layer.
 *   It NEVER replaces CarbonSignal as the routing truth.
 *   It ENRICHES RoutingResult and DecisionSnapshot with predictive context.
 */

// ─── EIA-930 Raw Data Types ───────────────────────────────────────────────────

export interface EIA930BalanceRow {
  period: string                // "2026-03-09T18" ISO-ish (hourly)
  respondent: string            // BA code, e.g. "MIDA" (PJM), "CAL" (CAISO)
  respondentName: string
  type: 'D' | 'NG' | 'TI' | 'DF'   // Demand, Net Generation, Total Interchange, Demand Forecast
  typeName: string
  timezone: string
  value: number | null          // MWh
  valueUnits: string            // "megawatthours"
}

export interface EIA930InterchangeRow {
  period: string
  fromba: string                // Origin BA code
  frombaName: string
  toba: string                  // Destination BA code
  tobaName: string
  timezone: string
  value: number | null          // MW (positive = from→to flow)
  valueUnits: string
}

export interface EIA930SubregionRow {
  period: string
  respondent: string            // Subregion BA code
  respondentName: string
  fueltype: string              // "SUN", "WND", "WAT", "COL", "NG", "NUC", "OTH", "OIL"
  typeName: string
  timezone: string
  value: number | null          // MWh
  valueUnits: string
}

// ─── Parsed / Normalized EIA-930 Structures ───────────────────────────────────

export interface BalanceSummary {
  region: string                // ECOBE region code
  balancingAuthority: string    // EIA-930 BA code
  timestamp: string             // ISO-8601 UTC
  demandMwh: number | null
  demandForecastMwh: number | null
  netGenerationMwh: number | null
  totalInterchangeMwh: number | null
  /** Positive = net importer, negative = net exporter */
  netImportMwh: number | null
  isEstimated: boolean
}

export interface InterchangeSummary {
  region: string
  balancingAuthority: string
  timestamp: string
  imports: Record<string, number>   // fromBA → MW
  exports: Record<string, number>   // toBA → MW
  totalImportMw: number
  totalExportMw: number
  netImportMw: number
}

export interface FuelMixSummary {
  region: string
  balancingAuthority: string
  timestamp: string
  /** Generation by fuel type in MWh */
  byFuel: {
    solar: number
    wind: number
    hydro: number
    nuclear: number
    naturalGas: number
    coal: number
    oil: number
    other: number
  }
  totalMwh: number
  renewableRatio: number        // 0–1: (solar+wind+hydro+nuclear) / total
  fossilRatio: number           // 0–1: (gas+coal+oil) / total
  isEstimated: boolean
}

// ─── Derived Feature Signals ──────────────────────────────────────────────────

export type RampDirection = 'rising' | 'falling' | 'stable'
export type SignalQuality = 'high' | 'medium' | 'low'

export interface DemandRampSignal {
  region: string
  balancingAuthority: string
  timestamp: string
  currentDemandMwh: number | null
  previousDemandMwh: number | null
  demandChangeMwh: number | null
  demandChangePct: number | null    // signed: positive=rising
  direction: RampDirection
  strength: number | null           // 0–1 normalized magnitude
}

export interface CurtailmentSignal {
  region: string
  balancingAuthority: string
  timestamp: string
  /**
   * Probability 0–1 that renewable curtailment is occurring or imminent.
   * High when: demand falling + high renewable ratio + export pressure + MOER forecasted low.
   */
  curtailmentProbability: number
  /** Contributing factors and their weights */
  drivers: {
    demandFalling: boolean
    highRenewableRatio: boolean
    exportPressure: boolean
    lowFossilDependency: boolean
    moerForecastDeclining: boolean
  }
  confidence: SignalQuality
}

export interface CarbonSpikeSignal {
  region: string
  balancingAuthority: string
  timestamp: string
  /**
   * Probability 0–1 that a carbon intensity spike is imminent.
   * High when: rising demand + high fossil ratio + unstable forecast + provider disagreement.
   */
  carbonSpikeProbability: number
  /** Contributing factors */
  drivers: {
    demandRising: boolean
    highFossilRatio: boolean
    weakRenewableSupport: boolean
    unstableForecast: boolean
    providerDisagreement: boolean
    importPressure: boolean
  }
  leadTimeHours: number             // estimated hours until spike
  confidence: SignalQuality
}

export interface InterchangeLeakageSignal {
  region: string
  balancingAuthority: string
  timestamp: string
  /**
   * Carbon leakage score 0–1.
   * Measures how much the zone's emissions are under-reported because of
   * heavy imports from higher-carbon neighbors.
   * 0 = no leakage risk, 1 = significant hidden fossil exposure.
   */
  importCarbonLeakageScore: number
  netImportMw: number
  isNetImporter: boolean
  importDependencyRatio: number     // imports / total demand 0–1
  topImportSource: string | null
}

// ─── Master Grid Signal Snapshot ─────────────────────────────────────────────

/**
 * The canonical normalized grid signal snapshot.
 * Assembled by grid-feature-engine from EIA-930 + WattTime + Electricity Maps.
 * All nullable fields represent signals that could not be computed.
 *
 * NEVER use for routing decisions directly — use CarbonSignal via provider-router.
 * This enriches routing results with predictive context only.
 */
export interface GridSignalSnapshot {
  region: string
  balancingAuthority: string | null

  // ── Time context ────────────────────────────────────────────────────────────
  timestamp: string                          // ISO-8601 UTC
  fetchedAt: string                          // when this snapshot was assembled

  // ── Demand / load ───────────────────────────────────────────────────────────
  demandMwh: number | null
  demandChangeMwh: number | null
  demandChangePct: number | null             // signed, percentage
  loadRampDirection: RampDirection | null
  loadRampStrength: number | null            // 0–1

  // ── Generation ──────────────────────────────────────────────────────────────
  netGenerationMwh: number | null
  netInterchangeMwh: number | null           // positive = net importer

  // ── Fuel mix (from SUBREGION or Electricity Maps fallback) ──────────────────
  renewableRatio: number | null              // 0–1
  fossilRatio: number | null                 // 0–1
  fuelMixSummary: Partial<FuelMixSummary['byFuel']> | null

  // ── Derived predictive signals ───────────────────────────────────────────────
  carbonSpikeProbability: number | null      // 0–1
  curtailmentProbability: number | null      // 0–1
  importCarbonLeakageScore: number | null    // 0–1

  // ── Data provenance ──────────────────────────────────────────────────────────
  signalQuality: SignalQuality
  /** True if any input data was estimated (not measured) */
  estimatedFlag: boolean
  /** True if any component was synthetically modeled (no real data) */
  syntheticFlag: boolean
  /** Data sources used to construct this snapshot */
  source: 'eia930' | 'eia930+watttime' | 'eia930+em' | 'synthetic'
  metadata: Record<string, unknown>
}

// ─── Snapshot Collection ─────────────────────────────────────────────────────

export type GridSignalMap = Map<string, GridSignalSnapshot>

// ─── Cache Entry ─────────────────────────────────────────────────────────────

export interface GridSignalCacheEntry {
  snapshot: GridSignalSnapshot
  cachedAt: number                           // Unix timestamp ms
  ttlSeconds: number
}

// ─── Ingestion Result ────────────────────────────────────────────────────────

export interface EIA930IngestionResult {
  region: string
  balancingAuthority: string
  timestamp: string
  balance: BalanceSummary | null
  interchange: InterchangeSummary | null
  fuelMix: FuelMixSummary | null
  error?: string
}

// ─── BA ↔ Region Mapping ─────────────────────────────────────────────────────

export interface BARegionMapping {
  /** EIA-930 respondent code, e.g. "MIDA" */
  baCode: string
  baName: string
  /** ECOBE/Electricity Maps region key, e.g. "US-MIDA-PJM" */
  region: string
  /** WattTime BA name, e.g. "PJM_ROANOKE" */
  watttimeBA: string | null
  timezone: string
  country: 'US' | 'CA' | 'MX'
}
