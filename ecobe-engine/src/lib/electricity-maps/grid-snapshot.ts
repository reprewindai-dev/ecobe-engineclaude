/**
 * GridSnapshot Assembler
 *
 * Assembles a fully normalized GridSnapshot from all available Electricity Maps signals.
 * This is the single integration point that Kobe's routing, governance, and DEKES
 * systems should use — never raw EM_ types.
 *
 * Signal priority:
 *   1. Level signals (fast, lightweight — always fetched)
 *   2. Carbon intensity + renewable % (core Tier 1 signals)
 *   3. Generation mix (Tier 3 — heavier, fetch on demand)
 *   4. Flows + net load (Tier 2 — fetch on demand for full picture)
 *   5. Price (Tier 4 — fetch separately via priceService)
 *
 * The assembler uses Promise.allSettled throughout so a failing signal
 * never blocks the snapshot — it just leaves that field undefined.
 */

import { emClient } from './client'
import { getElectricityMix } from './generation'
import { getElectricityFlows } from './flows'
import { getNetLoad } from './netload'
import { getZoneLevelSummary } from './levels'
import { getZoneTrustProfile } from './grid-trust'
import type { GridSnapshot } from './types'

export interface SnapshotOptions {
  /** Include generation mix (electricity-mix/latest). Default: true */
  includeMix?: boolean
  /** Include electricity flows. Default: false (heavier call) */
  includeFlows?: boolean
  /** Include net load. Default: false */
  includeNetLoad?: boolean
  /** Include fossil-only carbon intensity. Default: false */
  includeFossilCarbon?: boolean
}

/**
 * Build a complete GridSnapshot for a zone.
 * All signals are fetched concurrently.  Missing signals = undefined field.
 *
 * @example
 *   const snap = await assembleGridSnapshot('DE')
 *   console.log(snap.carbonIntensity)    // 245 gCO2/kWh
 *   console.log(snap.renewablePct)       // 68 %
 *   console.log(snap.flags.trustScore)   // 97
 */
export async function assembleGridSnapshot(
  zone: string,
  opts: SnapshotOptions = {},
): Promise<GridSnapshot> {
  const {
    includeMix = true,
    includeFlows = false,
    includeNetLoad = false,
    includeFossilCarbon = false,
  } = opts

  const fetchedAt = new Date().toISOString()

  // Launch all signal fetches concurrently
  const [
    carbonRes,
    renewableRes,
    carbonFreeRes,
    levelRes,
    mixRes,
    flowsRes,
    netLoadRes,
    fossilRes,
  ] = await Promise.allSettled([
    emClient.getCarbonIntensityLatest(zone),
    emClient.getRenewableEnergyLatest(zone),
    emClient.getCarbonFreeEnergyLatest(zone),
    getZoneLevelSummary(zone),
    includeMix ? getElectricityMix(zone) : Promise.resolve(null),
    includeFlows ? getElectricityFlows(zone) : Promise.resolve(null),
    includeNetLoad ? getNetLoad(zone) : Promise.resolve(null),
    includeFossilCarbon ? emClient.getCarbonIntensityFossilLatest(zone) : Promise.resolve(null),
  ])

  const carbon = carbonRes.status === 'fulfilled' ? carbonRes.value : null
  const renewable = renewableRes.status === 'fulfilled' ? renewableRes.value : null
  const carbonFree = carbonFreeRes.status === 'fulfilled' ? carbonFreeRes.value : null
  const levels = levelRes.status === 'fulfilled' ? levelRes.value : null
  const mix = mixRes.status === 'fulfilled' ? mixRes.value : null
  const flows = flowsRes.status === 'fulfilled' ? flowsRes.value : null
  const netLoad = netLoadRes.status === 'fulfilled' ? netLoadRes.value : null
  const fossil = fossilRes.status === 'fulfilled' ? fossilRes.value : null

  // Determine canonical datetime (prefer carbon reading, fall back to now)
  const datetime = carbon?.datetime ?? new Date().toISOString()

  // Compute trust profile
  const trust = getZoneTrustProfile(zone)

  const snapshot: GridSnapshot = {
    zone,
    datetime,
    fetchedAt,

    carbonIntensity: carbon?.carbonIntensity,
    fossilCarbonIntensity: fossil?.carbonIntensity,

    renewablePct: renewable?.value,
    carbonFreePct: carbonFree?.value,

    carbonLevel: levels?.carbonIntensityLevel,
    renewableLevel: levels?.renewablePercentageLevel,
    carbonFreeLevel: levels?.carbonFreePercentageLevel,

    mix: mix?.mix,

    netLoadMw: netLoad?.valueMw,
    netLoadIsEstimated: netLoad?.isEstimated,

    flows: flows
      ? { imports: flows.imports, exports: flows.exports }
      : undefined,

    flags: {
      isEstimated: carbon?.isEstimated,
      estimationMethod: carbon?.estimationMethod ?? null,
      temporalGranularity: carbon?.temporalGranularity ?? 'hourly',
      dataQuality: trust.tier === 'A' ? 'high' : trust.tier === 'B' ? 'medium' : 'low',
      trustScore: trust.trustScore,
      zoneTier: trust.tier === 'A' ? 'TIER_A' : trust.tier === 'B' ? 'TIER_B' : 'TIER_C',
    },
  }

  return snapshot
}

/**
 * Assemble snapshots for multiple zones concurrently.
 * Failed zones are silently excluded.
 */
export async function assembleGridSnapshots(
  zones: string[],
  opts?: SnapshotOptions,
): Promise<GridSnapshot[]> {
  const results = await Promise.allSettled(
    zones.map((zone) => assembleGridSnapshot(zone, opts)),
  )
  return results
    .filter((r): r is PromiseFulfilledResult<GridSnapshot> => r.status === 'fulfilled')
    .map((r) => r.value)
}

/**
 * Find the greenest zone from a list (lowest carbon intensity).
 * Returns the zone key of the best option.
 */
export async function findGreenestZone(
  zones: string[],
  opts?: SnapshotOptions,
): Promise<{ zone: string; carbonIntensity: number } | null> {
  const snapshots = await assembleGridSnapshots(zones, opts)
  const withCarbon = snapshots.filter((s) => s.carbonIntensity !== undefined)
  if (withCarbon.length === 0) return null

  const best = withCarbon.reduce((min, s) =>
    (s.carbonIntensity ?? Infinity) < (min.carbonIntensity ?? Infinity) ? s : min,
    withCarbon[0],
  )

  return { zone: best.zone, carbonIntensity: best.carbonIntensity! }
}
