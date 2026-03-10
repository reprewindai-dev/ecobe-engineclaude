/**
 * Fossil Spike Early-Warning System
 *
 * Uses the 4-signal leading indicator combination to predict fossil generation spikes
 * 1–3 hours BEFORE carbon intensity rises.
 *
 * Why this matters:
 *   Carbon intensity is a LAGGING metric — it reflects emissions after the fuel mix changes.
 *   Net load and renewable percentage are LEADING indicators.
 *   Together they reveal the fossil ramp window before it appears in carbon intensity.
 *
 * The 4 signals:
 *   1. Net Load      → primary leading indicator (rising = fossil plants must ramp)
 *   2. Renewable %   → supply pressure (falling = fossil must compensate)
 *   3. Generation Mix → fuel confirmation (gas/coal increasing = spike underway)
 *   4. Electricity Flows → hidden cause detector (dirty imports can mask the true source)
 *
 * Typical fossil spike sequence:
 *   T-3h  Renewable percentage drops (sunset / low wind)
 *   T-2h  Net load increases (demand rises, renewables declining)
 *   T-1h  Gas/coal generation ramps in the mix
 *   T0    Carbon intensity peaks
 *
 * Risk scoring:
 *   0–25   Low    → grid is green, no fossil pressure
 *   26–50  Moderate → signals mixed, monitor
 *   51–75  High   → fossil ramp underway, consider delaying workloads
 *   76–100 Critical → spike imminent or active
 */

import { getNetLoadHistory, classifyNetLoadTrend, netLoadDelta } from './netload'
import { getElectricityMix } from './generation'
import { getElectricityFlows } from './flows'
import { emClient } from './client'
import type { FossilSpikeSignal, FossilSpikeRisk } from './types'

interface SpikeInputs {
  zone: string
  netLoadTrend: 'rising' | 'falling' | 'stable'
  netLoadDeltaMw: number
  renewablePct: number | null
  previousRenewablePct: number | null
  fossilMw: number | null
  previousFossilMw: number | null
  netImportMw: number
}

function scoreRisk(inputs: SpikeInputs): number {
  let score = 0

  // Signal 1: Net load trend (weight 0.35)
  if (inputs.netLoadTrend === 'rising') {
    const magnitude = Math.min(inputs.netLoadDeltaMw / 3000, 1)  // normalize against 3GW
    score += magnitude * 35
  } else if (inputs.netLoadTrend === 'falling') {
    score -= 10
  }

  // Signal 2: Renewable percentage drop (weight 0.30)
  if (inputs.renewablePct !== null && inputs.previousRenewablePct !== null) {
    const renewableDrop = inputs.previousRenewablePct - inputs.renewablePct
    if (renewableDrop > 0) {
      const magnitude = Math.min(renewableDrop / 20, 1)  // 20% drop = full weight
      score += magnitude * 30
    } else if (renewableDrop < -5) {
      score -= 10  // renewables rising → reduce risk
    }
  } else if (inputs.renewablePct !== null && inputs.renewablePct < 20) {
    // Low renewable % absolute → moderate inherent risk
    score += 15
  }

  // Signal 3: Fossil generation ramp (weight 0.25)
  if (inputs.fossilMw !== null && inputs.previousFossilMw !== null) {
    const fossilRamp = inputs.fossilMw - inputs.previousFossilMw
    if (fossilRamp > 0) {
      const magnitude = Math.min(fossilRamp / 2000, 1)  // 2GW ramp = full weight
      score += magnitude * 25
    }
  }

  // Signal 4: Net imports rising (weight 0.10)
  // Imports from fossil-heavy neighbours increase hidden carbon exposure
  if (inputs.netImportMw > 500) {
    score += Math.min((inputs.netImportMw / 3000) * 10, 10)
  }

  return Math.max(0, Math.min(100, Math.round(score)))
}

function scoreToRisk(score: number): FossilSpikeRisk {
  if (score <= 25) return 'low'
  if (score <= 50) return 'moderate'
  if (score <= 75) return 'high'
  return 'critical'
}

function recommendation(risk: FossilSpikeRisk, leadTimeHours: number): string {
  switch (risk) {
    case 'low':
      return 'Grid conditions are clean. Run workloads now for lowest carbon impact.'
    case 'moderate':
      return 'Grid signals are mixed. Monitor next 30–60 minutes before scheduling large jobs.'
    case 'high':
      return `Fossil generation ramp detected. Defer flexible workloads by ${leadTimeHours}–3 hours or shift to a lower-carbon zone.`
    case 'critical':
      return 'Fossil spike imminent or active. Delay all deferrable compute. Consider cross-region routing immediately.'
  }
}

/**
 * Evaluate fossil spike risk for a zone.
 *
 * Fetches the 4 leading signals concurrently and computes a risk score.
 * Returns a FossilSpikeSignal with risk level, score, drivers, and recommendation.
 *
 * @example
 *   const signal = await evaluateFossilSpikeRisk('DE')
 *   if (signal.riskLevel === 'high' || signal.riskLevel === 'critical') {
 *     await deferWorkload(signal.leadTimeHours)
 *   }
 */
export async function evaluateFossilSpikeRisk(zone: string): Promise<FossilSpikeSignal> {
  const now = new Date().toISOString()

  // Fetch all 4 signals concurrently
  const [netLoadHistory, currentMix, currentFlows, currentCarbonRes] = await Promise.allSettled([
    getNetLoadHistory(zone),
    getElectricityMix(zone),
    getElectricityFlows(zone),
    emClient.getRenewableEnergyLatest(zone),
  ])

  // ── Signal 1: Net load trend ─────────────────────────────────────────────
  const netLoadReadings = netLoadHistory.status === 'fulfilled' ? netLoadHistory.value : []
  const trend = classifyNetLoadTrend(netLoadReadings)
  const deltaLoad =
    netLoadReadings.length >= 2
      ? netLoadDelta(netLoadReadings[0], netLoadReadings[netLoadReadings.length - 1])
      : 0

  // ── Signal 2: Renewable % ────────────────────────────────────────────────
  const currentCarbon = currentCarbonRes.status === 'fulfilled' ? currentCarbonRes.value : null
  const currentRenewable = currentCarbon?.value ?? null

  // Previous renewable: we derive from mix since we don't have a second renewable call
  const mix = currentMix.status === 'fulfilled' ? currentMix.value : null
  const previousRenewable = mix?.renewableSharePct ?? null

  // ── Signal 3: Fossil generation ──────────────────────────────────────────
  const fossilMw = mix?.totalFossilMw ?? null

  // ── Signal 4: Net imports ────────────────────────────────────────────────
  const flows = currentFlows.status === 'fulfilled' ? currentFlows.value : null
  const netImportMw = flows?.netImportMw ?? 0

  // ── Score ────────────────────────────────────────────────────────────────
  const inputs: SpikeInputs = {
    zone,
    netLoadTrend: trend,
    netLoadDeltaMw: Math.abs(deltaLoad),
    renewablePct: currentRenewable,
    previousRenewablePct: previousRenewable,
    fossilMw,
    previousFossilMw: null,  // would need a second historical point for full accuracy
    netImportMw,
  }

  const riskScore = scoreRisk(inputs)
  const riskLevel = scoreToRisk(riskScore)

  // Lead time estimate: lower risk → longer lead; critical = spike likely now
  const leadTimeHours =
    riskLevel === 'critical' ? 0
    : riskLevel === 'high'   ? 1
    : riskLevel === 'moderate' ? 2
    : 3

  return {
    zone,
    evaluatedAt: now,
    riskLevel,
    riskScore,
    leadTimeHours,
    drivers: {
      netLoadDelta: deltaLoad !== 0 ? deltaLoad : undefined,
      renewableDrop:
        currentRenewable !== null && previousRenewable !== null
          ? previousRenewable - currentRenewable
          : undefined,
      fossilRampMw: fossilMw !== null ? fossilMw : undefined,
      importIncreaseMw: netImportMw > 0 ? netImportMw : undefined,
    },
    recommendation: recommendation(riskLevel, leadTimeHours),
  }
}

/**
 * Evaluate fossil spike risk across multiple zones.
 * Returns results sorted by risk score (highest first).
 * Useful for selecting the lowest-risk zone for workload placement.
 */
export async function evaluateFossilSpikeRiskMultiZone(
  zones: string[],
): Promise<FossilSpikeSignal[]> {
  const results = await Promise.allSettled(
    zones.map((zone) => evaluateFossilSpikeRisk(zone)),
  )

  return results
    .filter((r): r is PromiseFulfilledResult<FossilSpikeSignal> => r.status === 'fulfilled')
    .map((r) => r.value)
    .sort((a, b) => b.riskScore - a.riskScore)  // highest risk first
}

/**
 * Find the safest (lowest fossil spike risk) zone from a list.
 */
export async function findLowestRiskZone(zones: string[]): Promise<string | null> {
  if (zones.length === 0) return null
  const signals = await evaluateFossilSpikeRiskMultiZone(zones)
  if (signals.length === 0) return null
  // Last item has lowest risk score
  return signals[signals.length - 1].zone
}
