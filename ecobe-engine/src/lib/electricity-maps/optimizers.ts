/**
 * Optimization Service — Beta Endpoints
 *
 * Wraps Electricity Maps' beta optimizer APIs:
 *   - Carbon-Aware Compute Optimizer: find the best time AND place to run compute
 *   - Smart Charging Optimizer: find the best time to charge an EV
 *
 * These endpoints are the highest-value integration points for:
 *   - Multi-region datacenter scheduling (choose greenest DC + lowest-carbon hour)
 *   - EV fleet management
 *   - Flexible industrial load shifting
 *
 * IMPORTANT: Beta endpoints — treat as unstable.
 *   - Request schema may change
 *   - Results are deterministic within a given forecast window
 *   - Re-evaluate every 15–30 minutes to account for forecast updates
 *
 * optimizationMetric options:
 *   'flow-traced_carbon_intensity' → minimize gCO2/kWh (default for most use cases)
 *   'net_load'                     → minimize fossil demand pressure
 *   'flow-traced_renewable_share'  → maximize clean energy %
 */

import { emClient } from './client'
import type {
  EM_CarbonAwareOptimizerRequest,
  EM_CarbonAwareOptimizerResponse,
  EM_SmartChargingOptimizerRequest,
  OptimizationMetric,
} from './types'

// ─── Carbon-Aware Compute Optimizer ──────────────────────────────────────────

export interface ComputeJob {
  /** ISO8601 duration, e.g. 'PT3H' for 3 hours */
  duration: string
  /** Earliest the job can start */
  startWindow: Date
  /** Latest the job can finish (end window for optimizer) */
  endWindow: Date
  /** Data center locations or [lon, lat] coordinates */
  locations: Array<
    | { dataCenterProvider: string; dataCenterRegion: string }
    | [number, number]
  >
  optimizationMetric?: OptimizationMetric
}

export interface ComputeOptimizationResult {
  optimalStartTime: string
  optimalLocation:
    | { dataCenterProvider: string; dataCenterRegion: string }
    | [number, number]
  zoneKey: string
  /** Carbon intensity at optimal execution */
  optimalMetricValue: number
  /** Carbon intensity if executed immediately */
  immediateMetricValue: number
  /** Carbon intensity at start of window */
  startWindowMetricValue: number
  metricUnit: string
  optimizationMetric: OptimizationMetric
  /** Estimated carbon savings % vs. immediate execution */
  savingsPct: number
}

/**
 * Find the optimal time and location to run a compute workload.
 *
 * @example
 *   const result = await optimizeComputeJob({
 *     duration: 'PT3H',
 *     startWindow: new Date(),
 *     endWindow: new Date(Date.now() + 72 * 3600 * 1000),
 *     locations: [
 *       { dataCenterProvider: 'gcp', dataCenterRegion: 'europe-west1' },
 *       { dataCenterProvider: 'gcp', dataCenterRegion: 'europe-north1' },
 *     ],
 *   })
 *   // result.optimalStartTime → best time to start
 *   // result.savingsPct → % carbon reduction vs. running now
 */
export async function optimizeComputeJob(job: ComputeJob): Promise<ComputeOptimizationResult | null> {
  const body: EM_CarbonAwareOptimizerRequest = {
    duration: job.duration,
    startWindow: job.startWindow.toISOString(),
    endWindow: job.endWindow.toISOString(),
    locations: job.locations,
    optimizationMetric: job.optimizationMetric ?? 'flow-traced_carbon_intensity',
  }

  const res = await emClient.runCarbonAwareOptimizer(body)
  if (!res) return null

  const { optimizationOutput: out } = res
  const savingsPct =
    out.metricValueImmediateExecution > 0
      ? Math.round(
          ((out.metricValueImmediateExecution - out.metricValueOptimalExecution) /
            out.metricValueImmediateExecution) *
            100,
        )
      : 0

  return {
    optimalStartTime: res.optimalStartTime,
    optimalLocation: res.optimalLocation,
    zoneKey: out.zoneKey,
    optimalMetricValue: out.metricValueOptimalExecution,
    immediateMetricValue: out.metricValueImmediateExecution,
    startWindowMetricValue: out.metricValueStartWindowExecution,
    metricUnit: out.metricUnit,
    optimizationMetric: out.optimizationMetric,
    savingsPct,
  }
}

// ─── Smart Charging Optimizer ─────────────────────────────────────────────────

export interface ChargingJob {
  /** ISO8601 duration, e.g. 'PT3H' for a 3-hour charge */
  duration: string
  /** Earliest charging can begin */
  startWindow: Date
  /** Latest charging can finish */
  endWindow: Date
  /** [lon, lat] of charger locations */
  locations: Array<[number, number]>
  /** Power draw in kW */
  powerConsumptionKw?: number
  optimizationMetric?: OptimizationMetric
}

export interface ChargingOptimizationResult {
  optimalStartTime: string
  optimalLocation: [number, number]
  zoneKey: string
  optimalMetricValue: number
  immediateMetricValue: number
  startWindowMetricValue: number
  metricUnit: string
  optimizationMetric: OptimizationMetric
  /** Estimated carbon savings % vs. charging immediately */
  savingsPct: number
}

/**
 * Find the optimal time to charge an EV (or fleet).
 *
 * @example
 *   const result = await optimizeChargingJob({
 *     duration: 'PT3H',
 *     startWindow: new Date(),
 *     endWindow: new Date(Date.now() + 8 * 3600 * 1000),
 *     locations: [[2.35, 48.85]],   // Paris charger
 *     powerConsumptionKw: 22,
 *   })
 */
export async function optimizeChargingJob(job: ChargingJob): Promise<ChargingOptimizationResult | null> {
  const body: EM_SmartChargingOptimizerRequest = {
    duration: job.duration,
    startWindow: job.startWindow.toISOString(),
    endWindow: job.endWindow.toISOString(),
    locations: job.locations,
    optimizationMetric: job.optimizationMetric ?? 'flow-traced_carbon_intensity',
    powerConsumption: job.powerConsumptionKw,
  }

  const res = await emClient.runSmartChargingOptimizer(body)
  if (!res) return null

  const { optimizationOutput: out } = res
  const savingsPct =
    out.metricValueImmediateExecution > 0
      ? Math.round(
          ((out.metricValueImmediateExecution - out.metricValueOptimalExecution) /
            out.metricValueImmediateExecution) *
            100,
        )
      : 0

  return {
    optimalStartTime: res.optimalStartTime,
    optimalLocation: res.optimalLocation as [number, number],
    zoneKey: out.zoneKey,
    optimalMetricValue: out.metricValueOptimalExecution,
    immediateMetricValue: out.metricValueImmediateExecution,
    startWindowMetricValue: out.metricValueStartWindowExecution,
    metricUnit: out.metricUnit,
    optimizationMetric: out.optimizationMetric,
    savingsPct,
  }
}

/**
 * Multi-region batch optimizer: evaluate several DC regions and return ranked results.
 * Uses the carbon-aware optimizer in sequence (one per region pair).
 * Useful when you want to compare options before committing.
 */
export async function rankDataCentersByCarbon(
  regions: Array<{ dataCenterProvider: string; dataCenterRegion: string }>,
  durationIso: string,
  windowHours: number = 24,
): Promise<ComputeOptimizationResult[]> {
  const now = new Date()
  const end = new Date(now.getTime() + windowHours * 3600 * 1000)

  const result = await optimizeComputeJob({
    duration: durationIso,
    startWindow: now,
    endWindow: end,
    locations: regions,
  })

  // The optimizer returns a single optimal result — return as ranked list
  return result ? [result] : []
}
