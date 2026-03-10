/**
 * Grid Signal Intelligence — Module Barrel
 *
 * Single import point for all grid signal exports.
 * Consumers should import from here, not from individual submodules.
 *
 * @example
 *   import { assembleGridSignalSnapshot, getCachedGridSignal } from '../grid-signals'
 */

// Types
export type {
  GridSignalSnapshot,
  GridSignalMap,
  GridSignalCacheEntry,
  EIA930IngestionResult,
  BARegionMapping,
  BalanceSummary,
  InterchangeSummary,
  FuelMixSummary,
  DemandRampSignal,
  CurtailmentSignal,
  CarbonSpikeSignal,
  InterchangeLeakageSignal,
  EIA930BalanceRow,
  EIA930InterchangeRow,
  EIA930SubregionRow,
  RampDirection,
  SignalQuality,
} from './types'

// Region mapping
export {
  getMappingByBACode,
  getMappingByRegion,
  getMappingByWatttimeBA,
  getAllBACodes,
  getAllSupportedRegions,
  baCodeToRegion,
  regionToBACode,
  regionToWatttimeBA,
  normalizeFuelCode,
} from './region-map'

// Feature engine (main assembly function)
export { assembleGridSignalSnapshot, assembleGridSignalSnapshots } from './grid-feature-engine'

// Cache
export {
  cacheGridSignal,
  getCachedGridSignal,
  getOrFetchGridSignal,
  invalidateGridSignal,
  getCacheTtl,
} from './grid-signal-cache'

// Ingestion
export {
  ingestRegion,
  ingestAllRegions,
  startIngestionPoller,
  stopIngestionPoller,
} from './ingestion'

// Parsers (for direct use when raw EIA-930 rows are available)
export { parseBalanceRows, parseBalanceByBA, parseBalanceTimeSeries } from './balance-parser'
export { parseInterchangeRows, parseInterchangeByBA, topImportSources } from './interchange-parser'
export { parseSubregionRows, parseSubregionByBA, parseSubregionTimeSeries, renewableRatioTrend } from './subregion-parser'

// Detectors
export { detectDemandRamp, classifyRamp } from './ramp-detector'
export { detectCurtailment } from './curtailment-detector'
export { analyzeInterchangeLeakage, rankByLeakageRisk } from './interchange-analyzer'
