/**
 * Electricity Maps — full type surface for Kobe/ECOBE engine.
 *
 * These types cover all 8 capability modules exposed by the Electricity Maps API:
 *   1. Identity + Access       (zones, zone, data-centers)
 *   2. Carbon Signals          (carbon-intensity, fossil-only, level)
 *   3. Clean-Energy Signals    (renewable-energy, carbon-free-energy, level signals)
 *   4. Generation Intelligence (electricity-mix, electricity-source)
 *   5. Interconnection         (electricity-flows)
 *   6. Load Intelligence       (net-load)
 *   7. Market Intelligence     (price-day-ahead)
 *   8. Optimization            (beta/carbon-aware-optimizer, beta/smart-charging-optimizer)
 *
 * Downstream code must normalise into GridSnapshot before routing decisions.
 * Raw API types are prefixed with EM_ and never passed to the routing layer.
 */

// ─── Enums ───────────────────────────────────────────────────────────────────

export type TemporalGranularity =
  | '5_minutes'
  | '15_minutes'
  | 'hourly'
  | 'daily'
  | 'monthly'
  | 'quarterly'
  | 'yearly'

export type EmissionFactorType = 'lifecycle' | 'direct'

export type OptimizationMetric =
  | 'flow-traced_carbon_intensity'
  | 'net_load'
  | 'flow-traced_renewable_share'

export type CarbonLevel = 'low' | 'moderate' | 'high'

export type ElectricitySource =
  | 'solar'
  | 'wind'
  | 'hydro'
  | 'nuclear'
  | 'gas'
  | 'coal'
  | 'oil'
  | 'biomass'
  | 'geothermal'
  | 'hydro-discharge'
  | 'battery-discharge'
  | 'unknown'

export type ZoneTier = 'TIER_A' | 'TIER_B' | 'TIER_C'

// ─── Tier 1 signal: Carbon intensity ─────────────────────────────────────────

export interface EM_CarbonIntensityPoint {
  carbonIntensity: number        // gCO2eq/kWh
  datetime: string               // ISO-8601
  updatedAt?: string
  isEstimated?: boolean
  estimationMethod?: string | null
}

export interface EM_CarbonIntensityResponse {
  zone: string
  carbonIntensity: number
  datetime: string
  updatedAt?: string
  fossilFuelPercentage?: number
  renewablePercentage?: number
  isEstimated?: boolean
  estimationMethod?: string | null
  temporalGranularity?: string
}

export interface EM_CarbonIntensityForecastResponse {
  zone: string
  updatedAt: string
  temporalGranularity: string
  forecast: EM_CarbonIntensityPoint[]
}

// ─── Tier 1 signal: Carbon intensity level (high/moderate/low) ────────────────

export interface EM_CarbonLevelPoint {
  level: CarbonLevel
  datetime: string
}

export interface EM_CarbonIntensityLevelResponse {
  zone: string
  data: EM_CarbonLevelPoint[]
}

export interface EM_RenewablePercentageLevelResponse {
  zone: string
  data: EM_CarbonLevelPoint[]
}

export interface EM_CarbonFreePercentageLevelResponse {
  zone: string
  data: EM_CarbonLevelPoint[]
}

// ─── Tier 2 signal: Renewable / Carbon-free energy ────────────────────────────

export interface EM_RenewableEnergyResponse {
  zone: string
  value: number                  // percentage 0–100
  datetime: string
  updatedAt?: string
  isEstimated?: boolean
}

export interface EM_CarbonFreeEnergyResponse {
  zone: string
  value: number                  // percentage 0–100
  datetime: string
  updatedAt?: string
  isEstimated?: boolean
}

// ─── Tier 3 signal: Generation mix ───────────────────────────────────────────

export interface EM_MixBreakdown {
  nuclear: number
  geothermal: number
  biomass: number
  coal: number
  wind: number
  solar: number
  hydro: number
  gas: number
  oil: number
  unknown: number
  'hydro discharge': number
  'battery discharge': number
  [key: string]: number
}

export interface EM_MixPoint {
  datetime: string
  updatedAt: string
  isEstimated?: boolean
  estimationMethod?: string | null
  mix: EM_MixBreakdown
}

export interface EM_ElectricityMixResponse {
  zone: string
  temporalGranularity: string
  unit: string
  data?: EM_MixPoint[]
  history?: EM_MixPoint[]
}

// ─── Per-source generation ────────────────────────────────────────────────────

export interface EM_SourcePoint {
  datetime: string
  updatedAt: string
  isEstimated?: boolean
  estimationMethod?: string | null
  value: number                  // MW
}

export interface EM_SourceResponse {
  zone: string
  source: string
  temporalGranularity: string
  unit: string
  data?: EM_SourcePoint[]
  history?: EM_SourcePoint[]
}

// ─── Electricity flows ────────────────────────────────────────────────────────

export interface EM_FlowPoint {
  datetime: string
  updatedAt: string
  import: Record<string, number>  // zone → MW
  export: Record<string, number>  // zone → MW
}

export interface EM_ElectricityFlowsResponse {
  zone: string
  temporalGranularity: string
  unit: string
  data?: EM_FlowPoint[]
  history?: EM_FlowPoint[]
}

// ─── Net load ─────────────────────────────────────────────────────────────────

export interface EM_NetLoadPoint {
  zone: string
  datetime: string
  createdAt: string
  updatedAt: string
  value: number
  unit: string
  source: string
  isEstimated: boolean
  estimationMethod: string | null
}

export interface EM_NetLoadResponse {
  zone: string
  temporalGranularity: string
  data?: EM_NetLoadPoint[]
  history?: EM_NetLoadPoint[]
}

export interface EM_NetLoadLatestResponse extends EM_NetLoadPoint {
  temporalGranularity: string
}

// ─── Day-ahead price ──────────────────────────────────────────────────────────

export interface EM_DayAheadPriceResponse {
  zone: string
  datetime: string
  createdAt: string
  updatedAt: string
  value: number
  unit: string                   // e.g. 'EUR/MWh', 'AUD/MWh'
  source: string
  temporalGranularity: string
}

// ─── Zone metadata ────────────────────────────────────────────────────────────

export interface EM_ZoneInfo {
  zoneKey: string
  zoneName: string
  countryCode: string
  countryName: string
  zoneParentKey: string | null
  subZoneKeys: string[]
  isCommerciallyAvailable: boolean
  tier: ZoneTier
  access?: string[]
}

export type EM_ZonesResponse = Record<string, EM_ZoneInfo>

export interface EM_DataCenter {
  provider: string
  lonlat: [number, number]
  displayName: string
  region: string
  zoneKey: string
  status: 'operational' | 'planned' | 'deprecated'
  source: string
  operationalSince: string | null
}

// ─── Updated-since ────────────────────────────────────────────────────────────

export interface EM_UpdateEntry {
  updated_at: string
  datetime: string
}

export interface EM_UpdatedSinceResponse {
  zone: string
  updates: EM_UpdateEntry[]
  threshold: string
  limit: number
  limitReached: boolean
}

// ─── Beta optimizers ──────────────────────────────────────────────────────────

export interface EM_CarbonAwareOptimizerRequest {
  duration: string                 // ISO8601, e.g. 'PT3H'
  startWindow: string              // ISO-8601
  endWindow: string                // ISO-8601
  locations: Array<
    | { dataCenterProvider: string; dataCenterRegion: string }
    | [number, number]             // [lon, lat]
  >
  optimizationMetric: OptimizationMetric
}

export interface EM_CarbonAwareOptimizerResponse {
  optimalStartTime: string
  optimalLocation:
    | { dataCenterProvider: string; dataCenterRegion: string }
    | [number, number]
  optimizationOutput: {
    metricValueImmediateExecution: number
    metricValueOptimalExecution: number
    metricValueStartWindowExecution: number
    metricUnit: string
    optimizationMetric: OptimizationMetric
    zoneKey: string
  }
}

export interface EM_SmartChargingOptimizerRequest {
  duration: string                 // ISO8601, e.g. 'PT3H'
  startWindow: string
  endWindow: string
  locations: Array<[number, number]>  // [lon, lat]
  optimizationMetric: OptimizationMetric
  powerConsumption?: number         // kW
}

export interface EM_SmartChargingOptimizerResponse {
  optimalStartTime: string
  optimalLocation: [number, number]
  optimizationOutput: {
    metricValueImmediateExecution: number
    metricValueOptimalExecution: number
    metricValueStartWindowExecution: number
    metricUnit: string
    optimizationMetric: OptimizationMetric
    zoneKey: string
  }
}

// ─── Normalized GridSnapshot (internal ECOBE type) ────────────────────────────

/**
 * The single normalized shape used by all ECOBE modules downstream of the
 * Electricity Maps adapter.  Nothing in routing, governance, or DEKES should
 * ever consume raw EM_ types.
 */
export interface GridSnapshot {
  zone: string
  datetime: string
  fetchedAt: string

  // Carbon
  carbonIntensity?: number          // gCO2eq/kWh
  fossilCarbonIntensity?: number    // gCO2eq/kWh (fossil-only)

  // Clean energy percentages
  renewablePct?: number             // 0–100
  carbonFreePct?: number            // 0–100

  // Level signals
  carbonLevel?: CarbonLevel
  renewableLevel?: CarbonLevel
  carbonFreeLevel?: CarbonLevel

  // Generation mix (MW values per source)
  mix?: Record<string, number>

  // Net load (demand minus solar+wind, MW)
  netLoadMw?: number
  netLoadIsEstimated?: boolean

  // Electricity flows
  flows?: {
    imports: Record<string, number>  // zone → MW
    exports: Record<string, number>  // zone → MW
  }

  // Market
  price?: {
    value: number
    unit: string
  }

  // Data provenance
  flags: {
    isEstimated?: boolean
    estimationMethod?: string | null
    temporalGranularity?: string
    dataQuality: 'high' | 'medium' | 'low'
    trustScore?: number              // 0–100, computed by grid-trust layer
    zoneTier?: ZoneTier
  }
}

// ─── Fossil spike prediction ──────────────────────────────────────────────────

export type FossilSpikeRisk = 'low' | 'moderate' | 'high' | 'critical'

export interface FossilSpikeSignal {
  zone: string
  evaluatedAt: string
  riskLevel: FossilSpikeRisk
  riskScore: number                  // 0–100
  leadTimeHours: number              // estimated hours before spike
  drivers: {
    netLoadDelta?: number            // MW change in net load
    renewableDrop?: number           // percentage points drop in renewables
    fossilRampMw?: number            // MW increase in fossil sources
    importIncreaseMw?: number        // MW increase in imports
  }
  recommendation: string
}

// ─── Grid trust scoring ───────────────────────────────────────────────────────

export interface ZoneSignalCoverage {
  zone: string
  signal: string
  subsignal?: string
  historicalCompleteness?: number  // 0–100
  estimatedShare?: number          // 0–100
  forecastHorizons?: number[]      // hours: [24, 48, 72]
  realTimeGranularity?: string
  requiresThirdPartyLicense?: boolean
}

export interface ZoneTrustProfile {
  zone: string
  trustScore: number               // 0–100 composite
  tier: 'A' | 'B' | 'C'           // A=high, B=medium, C=low trust
  signalCoverage: Partial<Record<string, number>>  // signal → trust 0–100
  forecastReliable: boolean
  recommendedForOptimization: boolean
}
