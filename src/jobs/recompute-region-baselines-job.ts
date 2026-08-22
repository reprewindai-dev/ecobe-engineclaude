/**
 * Recompute Region Baselines Job
 *
 * Scheduled wrapper around recomputeRegionBaselines().
 * Runs every 6-12 hours via intelligence-scheduler — separate from the
 * 15-minute EIA ingestion worker. Does NOT alter live provider doctrine.
 */

import { recomputeRegionBaselines, type RegionBaselineResult } from '../services/recompute-region-baselines'

export async function runRecomputeJob(windowDays = 60): Promise<void> {
  const start = Date.now()
  console.log(`[recompute-job] Starting region baseline recomputation (window=${windowDays}d)...`)

  let results: RegionBaselineResult[] = []

  try {
    results = await recomputeRegionBaselines({ windowDays })
  } catch (err) {
    console.error('[recompute-job] Fatal error during recomputation:', err)
    return
  }

  const total = results.length
  const synthetic = results.filter(r => r.syntheticFlag).length
  const estimated = results.filter(r => r.estimatedFlag && !r.syntheticFlag).length
  const live = total - synthetic - estimated
  const highConf = results.filter(r => r.recomputeConfidence === 'HIGH').length
  const medConf = results.filter(r => r.recomputeConfidence === 'MEDIUM').length
  const lowConf = results.filter(r => r.recomputeConfidence === 'LOW').length
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)

  console.log(
    `[recompute-job] Done in ${elapsed}s — ` +
    `${total} regions: ${live} live / ${estimated} estimated / ${synthetic} synthetic | ` +
    `confidence: ${highConf} HIGH / ${medConf} MEDIUM / ${lowConf} LOW`
  )
}
