/**
 * Grid Feature Engine
 *
 * Orchestrates the full EIA-930 + WattTime + Electricity Maps signal assembly pipeline.
 * Produces a normalized GridSignalSnapshot for any ECOBE-mapped US region.
 *
 * Data flow:
 *   1. Resolve region → EIA-930 BA code via region-map
 *   2. Fetch EIA-930 BALANCE + INTERCHANGE + SUBREGION concurrently
 *   3. Parse raw rows into BalanceSummary, InterchangeSummary, FuelMixSummary
 *   4. Run ramp-detector, curtailment-detector, interchange-analyzer
 *   5. Compute carbon spike probability from combined signals
 *   6. Assemble GridSignalSnapshot with provenance flags
 *
 * Provider doctrine:
 *   This engine is an ENRICHMENT layer. It never replaces CarbonSignal.
 *   Its outputs augment RoutingResult and DecisionSnapshot with predictive context.
 */

import { eia930 } from '../eia930-client'
import { parseBalanceTimeSeries, parseBalanceByBA } from './balance-parser'
import { parseInterchangeByBA } from './interchange-parser'
import { parseSubregionByBA } from './subregion-parser'
import { detectDemandRamp } from './ramp-detector'
import { detectCurtailment } from './curtailment-detector'
import { analyzeInterchangeLeakage } from './interchange-analyzer'
import { regionToBACode } from './region-map'
import { logger } from '../logger'
import type {
  GridSignalSnapshot,
  BalanceSummary,
  InterchangeSummary,
  FuelMixSummary,
  CarbonSpikeSignal,
  SignalQuality,
} from './types'

// Hours of history to fetch for trend computation
const HISTORY_HOURS = 6

/**
 * Compute carbon spike probability from available signals.
 * Returns a 0–1 probability estimate and a structured drivers object.
 */
function computeCarbonSpike(
  rampSignal: ReturnType<typeof detectDemandRamp>,
  fuelMix: FuelMixSummary | null,
  interchange: InterchangeSummary | null,
  providerDisagreement: boolean,
  forecastUnstable: boolean,
): CarbonSpikeSignal | null {
  if (!rampSignal) return null

  const drivers = {
    demandRising: rampSignal.direction === 'rising',
    highFossilRatio: (fuelMix?.fossilRatio ?? 0) > 0.45,
    weakRenewableSupport: (fuelMix?.renewableRatio ?? 1) < 0.30,
    unstableForecast: forecastUnstable,
    providerDisagreement,
    importPressure: (interchange?.netImportMw ?? 0) > 800,
  }

  let score = 0

  // Signal 1: Rising demand (weight 0.35)
  if (drivers.demandRising) {
    score += (rampSignal.strength ?? 0) * 0.35
  }

  // Signal 2: High fossil ratio (weight 0.25)
  if (drivers.highFossilRatio && fuelMix) {
    score += Math.min((fuelMix.fossilRatio - 0.45) / 0.30 * 0.25, 0.25)
  }

  // Signal 3: Weak renewable support (weight 0.15)
  if (drivers.weakRenewableSupport && fuelMix) {
    score += Math.min((0.30 - fuelMix.renewableRatio) / 0.30 * 0.15, 0.15)
  }

  // Signal 4: Unstable forecast (weight 0.10)
  if (drivers.unstableForecast) score += 0.10

  // Signal 5: Provider disagreement (weight 0.10)
  if (drivers.providerDisagreement) score += 0.10

  // Signal 6: Import pressure (weight 0.05)
  if (drivers.importPressure && interchange) {
    score += Math.min(interchange.netImportMw / 5000 * 0.05, 0.05)
  }

  const probability = Math.min(Math.max(score, 0), 1)
  const leadTimeHours = probability > 0.7 ? 0 : probability > 0.4 ? 1 : 2

  const signalCount =
    (rampSignal ? 1 : 0) +
    (fuelMix ? 1 : 0) +
    (interchange ? 1 : 0)

  const confidence: SignalQuality =
    signalCount >= 3 ? 'high' : signalCount >= 2 ? 'medium' : 'low'

  return {
    region: rampSignal.region,
    balancingAuthority: rampSignal.balancingAuthority,
    timestamp: rampSignal.timestamp,
    carbonSpikeProbability: Math.round(probability * 1000) / 1000,
    drivers,
    leadTimeHours,
    confidence,
  }
}

/**
 * Determine overall signal quality from data completeness.
 */
function assessSignalQuality(
  balance: BalanceSummary | null,
  interchange: InterchangeSummary | null,
  fuelMix: FuelMixSummary | null,
): SignalQuality {
  const present = [balance, interchange, fuelMix].filter(Boolean).length
  if (present === 3) return 'high'
  if (present === 2) return 'medium'
  return 'low'
}

/**
 * Assemble a GridSignalSnapshot for a single ECOBE region.
 *
 * @param region  ECOBE region code, e.g. 'US-MIDA-PJM'
 * @param opts    Optional override signals (from WattTime/EM)
 */
export async function assembleGridSignalSnapshot(
  region: string,
  opts: {
    providerDisagreement?: boolean
    forecastUnstable?: boolean
    moerForecastDeclining?: boolean
  } = {},
): Promise<GridSignalSnapshot | null> {
  const baCode = regionToBACode(region)
  if (!baCode) {
    logger.debug({ region }, '[grid-feature] No BA mapping — skipping EIA-930 enrichment')
    return null
  }

  const fetchedAt = new Date().toISOString()

  // Fetch all 3 streams concurrently
  const [balanceRaw, interchangeRaw, subregionRaw] = await Promise.allSettled([
    eia930.fetchBalance([baCode], HISTORY_HOURS),
    eia930.fetchInterchange([baCode], HISTORY_HOURS),
    eia930.fetchSubregion([baCode], HISTORY_HOURS),
  ])

  // ── Parse ────────────────────────────────────────────────────────────────────

  const balanceSeries = balanceRaw.status === 'fulfilled' && balanceRaw.value
    ? parseBalanceTimeSeries(balanceRaw.value, baCode)
    : []

  const interchangeMap = interchangeRaw.status === 'fulfilled' && interchangeRaw.value
    ? parseInterchangeByBA(interchangeRaw.value)
    : new Map<string, InterchangeSummary>()

  const fuelMixMap = subregionRaw.status === 'fulfilled' && subregionRaw.value
    ? parseSubregionByBA(subregionRaw.value)
    : new Map<string, FuelMixSummary>()

  const latestBalance = balanceSeries.length > 0 ? balanceSeries[balanceSeries.length - 1] : null
  const previousBalance = balanceSeries.length >= 2 ? balanceSeries[balanceSeries.length - 2] : null
  const interchange = interchangeMap.get(baCode) ?? null
  const fuelMix = fuelMixMap.get(baCode) ?? null

  // ── Detect signals ────────────────────────────────────────────────────────────

  const rampSignal = detectDemandRamp(balanceSeries)

  const curtailmentSignal = detectCurtailment({
    balance: latestBalance,
    previousBalance,
    fuelMix,
    interchange,
    moerForecastDeclining: opts.moerForecastDeclining,
  })

  const leakageSignal = interchange
    ? analyzeInterchangeLeakage(interchange, latestBalance)
    : null

  const spikeSignal = computeCarbonSpike(
    rampSignal,
    fuelMix,
    interchange,
    opts.providerDisagreement ?? false,
    opts.forecastUnstable ?? false,
  )

  // ── Assemble snapshot ─────────────────────────────────────────────────────────

  const timestamp = latestBalance?.timestamp ?? fetchedAt
  const signalQuality = assessSignalQuality(latestBalance, interchange, fuelMix)

  const snapshot: GridSignalSnapshot = {
    region,
    balancingAuthority: baCode,
    timestamp,
    fetchedAt,

    // Demand / load
    demandMwh: latestBalance?.demandMwh ?? null,
    demandChangeMwh: rampSignal?.demandChangeMwh ?? null,
    demandChangePct: rampSignal?.demandChangePct ?? null,
    loadRampDirection: rampSignal?.direction ?? null,
    loadRampStrength: rampSignal?.strength ?? null,

    // Generation
    netGenerationMwh: latestBalance?.netGenerationMwh ?? null,
    netInterchangeMwh: latestBalance?.netImportMwh ?? null,

    // Fuel mix
    renewableRatio: fuelMix?.renewableRatio ?? null,
    fossilRatio: fuelMix?.fossilRatio ?? null,
    fuelMixSummary: fuelMix?.byFuel ?? null,

    // Derived predictive signals
    carbonSpikeProbability: spikeSignal?.carbonSpikeProbability ?? null,
    curtailmentProbability: curtailmentSignal?.curtailmentProbability ?? null,
    importCarbonLeakageScore: leakageSignal?.importCarbonLeakageScore ?? null,

    // Provenance
    signalQuality,
    estimatedFlag: latestBalance?.isEstimated ?? fuelMix?.isEstimated ?? false,
    syntheticFlag: signalQuality === 'low',
    source: 'eia930',
    metadata: {
      baCode,
      historyHours: HISTORY_HOURS,
      balancePeriods: balanceSeries.length,
      hasInterchange: interchange != null,
      hasFuelMix: fuelMix != null,
    },
  }

  return snapshot
}

/**
 * Assemble snapshots for multiple regions concurrently.
 * Returns a map of region → snapshot (missing = no BA mapping or all fetches failed).
 */
export async function assembleGridSignalSnapshots(
  regions: string[],
  opts: Parameters<typeof assembleGridSignalSnapshot>[1] = {},
): Promise<Map<string, GridSignalSnapshot>> {
  const results = await Promise.allSettled(
    regions.map((r) => assembleGridSignalSnapshot(r, opts)),
  )

  const map = new Map<string, GridSignalSnapshot>()
  for (let i = 0; i < regions.length; i++) {
    const r = results[i]
    if (r.status === 'fulfilled' && r.value) {
      map.set(regions[i], r.value)
    }
  }
  return map
}
