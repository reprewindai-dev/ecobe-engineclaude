/**
 * Demand Ramp Detector
 *
 * Detects the direction and magnitude of load changes from BALANCE time-series data.
 * Rising demand → fossil plants must ramp → leading indicator for carbon spikes.
 * Falling demand → potential curtailment window → renewable excess signal.
 *
 * Ramp thresholds:
 *   Strength > 0.8  → strong ramp
 *   Strength 0.4–0.8 → moderate ramp
 *   Strength < 0.4  → weak / stable
 */

import type { BalanceSummary, DemandRampSignal, RampDirection } from './types'

// 3 GW swing = full-strength ramp (reference: PJM peak swing ~5GW, CAISO ~3GW)
const FULL_RAMP_MW = 3_000

/**
 * Compute demand ramp signal from a time-ordered sequence of BalanceSummary records.
 * Uses the latest and earliest points available to measure the directional change.
 *
 * @param series  Ascending time-ordered BalanceSummary for a single BA
 */
export function detectDemandRamp(series: BalanceSummary[]): DemandRampSignal | null {
  if (series.length < 2) return null

  const latest = series[series.length - 1]
  const earliest = series[0]

  if (latest.demandMwh == null || earliest.demandMwh == null) return null

  const currentDemandMwh = latest.demandMwh
  const previousDemandMwh = earliest.demandMwh
  const demandChangeMwh = currentDemandMwh - previousDemandMwh
  const demandChangePct =
    previousDemandMwh !== 0
      ? (demandChangeMwh / previousDemandMwh) * 100
      : null

  const absDelta = Math.abs(demandChangeMwh)
  const strength = Math.min(absDelta / FULL_RAMP_MW, 1)

  let direction: RampDirection
  if (absDelta < 200) {
    direction = 'stable'
  } else if (demandChangeMwh > 0) {
    direction = 'rising'
  } else {
    direction = 'falling'
  }

  return {
    region: latest.region,
    balancingAuthority: latest.balancingAuthority,
    timestamp: latest.timestamp,
    currentDemandMwh,
    previousDemandMwh,
    demandChangeMwh,
    demandChangePct,
    direction,
    strength,
  }
}

/**
 * Classify a single demand change into ramp direction.
 * Convenience wrapper for when only two data points are available.
 */
export function classifyRamp(
  currentMwh: number,
  previousMwh: number,
): { direction: RampDirection; changeMwh: number; strength: number } {
  const changeMwh = currentMwh - previousMwh
  const abs = Math.abs(changeMwh)
  const strength = Math.min(abs / FULL_RAMP_MW, 1)
  const direction: RampDirection =
    abs < 200 ? 'stable' : changeMwh > 0 ? 'rising' : 'falling'
  return { direction, changeMwh, strength }
}
