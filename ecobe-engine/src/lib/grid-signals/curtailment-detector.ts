/**
 * Renewable Curtailment Detector
 *
 * Detects probability of renewable curtailment (renewables available > demand can absorb).
 * Curtailment = operators instructing renewable generators to reduce output below potential.
 *
 * Leading indicators:
 *   1. Demand falling         → less room for renewables
 *   2. High renewable ratio   → renewables are dominant → risk of oversupply
 *   3. Export pressure        → BA exporting heavily (net exporter) → offloading excess
 *   4. Low fossil dependency  → conventional units already at minimum (must back off)
 *   5. MOER/forecast declining → operator expects surplus
 *
 * Typical curtailment regions: CAISO (solar), ERCOT (wind), BPAT (hydro)
 */

import type { BalanceSummary, FuelMixSummary, InterchangeSummary, CurtailmentSignal, SignalQuality } from './types'

interface CurtailmentInputs {
  balance: BalanceSummary | null
  previousBalance: BalanceSummary | null
  fuelMix: FuelMixSummary | null
  interchange: InterchangeSummary | null
  moerForecastDeclining?: boolean
}

/**
 * Evaluate curtailment probability from available signals.
 * All inputs are nullable — missing signals are treated conservatively (not contributing).
 */
export function detectCurtailment(inputs: CurtailmentInputs): CurtailmentSignal | null {
  if (!inputs.balance) return null

  const drivers = {
    demandFalling: false,
    highRenewableRatio: false,
    exportPressure: false,
    lowFossilDependency: false,
    moerForecastDeclining: inputs.moerForecastDeclining ?? false,
  }

  let score = 0
  let signalCount = 0

  // Driver 1: Demand falling (weight 0.25)
  if (inputs.previousBalance?.demandMwh != null && inputs.balance.demandMwh != null) {
    signalCount++
    const demandChange = inputs.balance.demandMwh - inputs.previousBalance.demandMwh
    if (demandChange < -200) {
      drivers.demandFalling = true
      score += 0.25
    }
  }

  // Driver 2: High renewable ratio (weight 0.30)
  if (inputs.fuelMix) {
    signalCount++
    if (inputs.fuelMix.renewableRatio >= 0.65) {
      drivers.highRenewableRatio = true
      // Scale: 65% = 0.15, 85%+ = 0.30
      score += Math.min((inputs.fuelMix.renewableRatio - 0.65) / 0.20 * 0.30, 0.30)
    } else if (inputs.fuelMix.renewableRatio >= 0.50) {
      // Moderate contribution
      score += 0.10
    }
  }

  // Driver 3: Export pressure (weight 0.20)
  if (inputs.interchange) {
    signalCount++
    if (inputs.interchange.netImportMw < -500) {
      // Net exporter (negative = exporting)
      drivers.exportPressure = true
      score += Math.min(Math.abs(inputs.interchange.netImportMw) / 3000 * 0.20, 0.20)
    }
  }

  // Driver 4: Low fossil dependency (weight 0.15)
  if (inputs.fuelMix) {
    if (inputs.fuelMix.fossilRatio < 0.10) {
      drivers.lowFossilDependency = true
      score += 0.15
    } else if (inputs.fuelMix.fossilRatio < 0.20) {
      score += 0.07
    }
  }

  // Driver 5: MOER forecast declining (weight 0.10)
  if (inputs.moerForecastDeclining) {
    score += 0.10
  }

  const probability = Math.min(Math.max(score, 0), 1)

  // Signal quality based on how many drivers were computable
  const confidence: SignalQuality =
    signalCount >= 3 ? 'high'
    : signalCount >= 2 ? 'medium'
    : 'low'

  return {
    region: inputs.balance.region,
    balancingAuthority: inputs.balance.balancingAuthority,
    timestamp: inputs.balance.timestamp,
    curtailmentProbability: probability,
    drivers,
    confidence,
  }
}
