/**
 * Electricity Maps — ECOBE/Kobe Integration Module
 *
 * Barrel exports for all 8 capability modules.
 * Import from here in all application code — never import sub-modules directly.
 *
 * Capability modules:
 *   client          → raw HTTP client (use service modules instead)
 *   types           → all TypeScript types
 *   generation      → electricity mix + per-source generation
 *   flows           → cross-border electricity flows
 *   netload         → net load (demand − solar − wind)
 *   price           → day-ahead electricity prices
 *   levels          → high/moderate/low level signals
 *   zones           → zone metadata + data center mapping
 *   optimizers      → beta carbon-aware + smart-charging optimizers
 *   fossil-spike    → 4-signal fossil generation spike predictor
 *   grid-trust      → zone data quality / trust scoring
 *   grid-snapshot   → normalized GridSnapshot assembler (primary integration point)
 */

// ─── Types (all exported from one place) ─────────────────────────────────────
export type {
  GridSnapshot,
  FossilSpikeSignal,
  FossilSpikeRisk,
  ZoneTrustProfile,
  ZoneSignalCoverage,
  CarbonLevel,
  ElectricitySource,
  OptimizationMetric,
  TemporalGranularity,
  ZoneTier,
  EM_CarbonIntensityResponse,
  EM_ElectricityMixResponse,
  EM_MixBreakdown,
  EM_FlowPoint,
  EM_NetLoadPoint,
  EM_DayAheadPriceResponse,
  EM_ZoneInfo,
  EM_DataCenter,
  EM_CarbonAwareOptimizerRequest,
  EM_CarbonAwareOptimizerResponse,
  EM_SmartChargingOptimizerRequest,
  EM_SmartChargingOptimizerResponse,
} from './types'

// ─── HTTP Client (singleton) ──────────────────────────────────────────────────
export { emClient } from './client'

// ─── Generation Intelligence ──────────────────────────────────────────────────
export {
  getElectricityMix,
  getElectricityMixHistory,
  getElectricityMixRange,
  getElectricityMixForecast,
  getSourceGeneration,
  getSourceGenerationHistory,
  getSourceGenerationForecast,
} from './generation'
export type { GenerationMixSnapshot, SourceGenerationSnapshot } from './generation'

// ─── Interconnection Intelligence ────────────────────────────────────────────
export {
  getElectricityFlows,
  getElectricityFlowsHistory,
  getElectricityFlowsRange,
  getElectricityFlowsForecast,
  rankImportsByVolume,
} from './flows'
export type { FlowSnapshot } from './flows'

// ─── Load Intelligence ────────────────────────────────────────────────────────
export {
  getNetLoad,
  getNetLoadHistory,
  getNetLoadRange,
  getNetLoadForecast,
  netLoadDelta,
  classifyNetLoadTrend,
} from './netload'
export type { NetLoadSnapshot } from './netload'

// ─── Market Intelligence ──────────────────────────────────────────────────────
export {
  getDayAheadPrice,
  getDayAheadPricePast,
  getDayAheadPriceRange,
  getDayAheadPriceForecast,
  findCheapestHour,
} from './price'
export type { DayAheadPriceSnapshot } from './price'

// ─── Level Signals ────────────────────────────────────────────────────────────
export {
  getCarbonIntensityLevel,
  getRenewablePercentageLevel,
  getCarbonFreePercentageLevel,
  getZoneLevelSummary,
  isGreenSchedulingWindow,
} from './levels'
export type { LevelSnapshot, ZoneLevelSummary } from './levels'

// ─── Zone + Datacenter Metadata ───────────────────────────────────────────────
export {
  getAccessibleZones,
  getFullAccessZones,
  getZoneInfo,
  resolveZoneByCoords,
  getDataCenters,
  getZoneForDataCenter,
  buildDataCenterZoneMap,
  getUpdatedSince,
} from './zones'
export type { ZoneMetadata, DataCenterInfo } from './zones'

// ─── Beta Optimizers ──────────────────────────────────────────────────────────
export {
  optimizeComputeJob,
  optimizeChargingJob,
  rankDataCentersByCarbon,
} from './optimizers'
export type {
  ComputeJob,
  ComputeOptimizationResult,
  ChargingJob,
  ChargingOptimizationResult,
} from './optimizers'

// ─── Fossil Spike Prediction ──────────────────────────────────────────────────
export {
  evaluateFossilSpikeRisk,
  evaluateFossilSpikeRiskMultiZone,
  findLowestRiskZone,
} from './fossil-spike'

// ─── Grid Trust Scoring ───────────────────────────────────────────────────────
export {
  getZoneTrustProfile,
  rankZonesByTrust,
  filterTierAZones,
  filterOutTierCZones,
  adjustConfidenceForZone,
  zoneDataQuality,
  skipForecastOptimization,
} from './grid-trust'

// ─── GridSnapshot Assembler (primary integration point) ───────────────────────
export {
  assembleGridSnapshot,
  assembleGridSnapshots,
  findGreenestZone,
} from './grid-snapshot'
export type { SnapshotOptions } from './grid-snapshot'
