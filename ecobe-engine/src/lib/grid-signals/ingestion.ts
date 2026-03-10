/**
 * EIA-930 Ingestion Service
 *
 * Scheduled poller and on-demand fetcher for EIA-930 telemetry.
 * Fetches BALANCE + INTERCHANGE + SUBREGION for all mapped US BAs,
 * assembles GridSignalSnapshots, and writes to the Redis cache.
 *
 * Schedule: every 5 minutes (EIA-930 publishes hourly; 5-min polling catches
 * back-revisions and keeps cache warm at 300s TTL).
 *
 * Usage:
 *   import { startIngestionPoller } from './ingestion'
 *   startIngestionPoller()  // call once at app startup
 *
 *   import { ingestRegion } from './ingestion'
 *   await ingestRegion('US-MIDA-PJM')  // on-demand
 */

import { assembleGridSignalSnapshot } from './grid-feature-engine'
import { cacheGridSignal } from './grid-signal-cache'
import { auditIngestionResult } from './grid-signal-audit'
import { getAllBACodes, baCodeToRegion } from './region-map'
import { logger } from '../logger'
import { env } from '../../config/env'
import type { EIA930IngestionResult } from './types'

// Default polling interval: 5 minutes
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000

let pollerTimer: ReturnType<typeof setInterval> | null = null

/**
 * Ingest and cache the grid signal snapshot for a single region.
 * Returns an EIA930IngestionResult for observability.
 */
export async function ingestRegion(region: string): Promise<EIA930IngestionResult> {
  let snapshot
  try {
    snapshot = await assembleGridSignalSnapshot(region)
  } catch (err: any) {
    const result: EIA930IngestionResult = {
      region,
      balancingAuthority: region,
      timestamp: new Date().toISOString(),
      balance: null,
      interchange: null,
      fuelMix: null,
      error: err?.message ?? 'unknown error',
    }
    auditIngestionResult(result)
    return result
  }

  if (!snapshot) {
    const result: EIA930IngestionResult = {
      region,
      balancingAuthority: region,
      timestamp: new Date().toISOString(),
      balance: null,
      interchange: null,
      fuelMix: null,
      error: 'No BA mapping or EIA-930 key not configured',
    }
    auditIngestionResult(result)
    return result
  }

  await cacheGridSignal(snapshot)

  const result: EIA930IngestionResult = {
    region,
    balancingAuthority: snapshot.balancingAuthority ?? region,
    timestamp: snapshot.timestamp,
    // Balance/interchange/fuelMix are embedded in the snapshot; nil-safe extraction
    balance: snapshot.demandMwh != null ? {
      region,
      balancingAuthority: snapshot.balancingAuthority ?? region,
      timestamp: snapshot.timestamp,
      demandMwh: snapshot.demandMwh,
      demandForecastMwh: null,
      netGenerationMwh: snapshot.netGenerationMwh,
      totalInterchangeMwh: snapshot.netInterchangeMwh != null ? -snapshot.netInterchangeMwh : null,
      netImportMwh: snapshot.netInterchangeMwh,
      isEstimated: snapshot.estimatedFlag,
    } : null,
    interchange: snapshot.importCarbonLeakageScore != null ? {
      region,
      balancingAuthority: snapshot.balancingAuthority ?? region,
      timestamp: snapshot.timestamp,
      imports: {},
      exports: {},
      totalImportMw: 0,
      totalExportMw: 0,
      netImportMw: snapshot.netInterchangeMwh ?? 0,
    } : null,
    fuelMix: snapshot.renewableRatio != null ? {
      region,
      balancingAuthority: snapshot.balancingAuthority ?? region,
      timestamp: snapshot.timestamp,
      byFuel: {
        solar: snapshot.fuelMixSummary?.solar ?? 0,
        wind: snapshot.fuelMixSummary?.wind ?? 0,
        hydro: snapshot.fuelMixSummary?.hydro ?? 0,
        nuclear: snapshot.fuelMixSummary?.nuclear ?? 0,
        naturalGas: snapshot.fuelMixSummary?.naturalGas ?? 0,
        coal: snapshot.fuelMixSummary?.coal ?? 0,
        oil: snapshot.fuelMixSummary?.oil ?? 0,
        other: snapshot.fuelMixSummary?.other ?? 0,
      },
      totalMwh: snapshot.netGenerationMwh ?? 0,
      renewableRatio: snapshot.renewableRatio,
      fossilRatio: snapshot.fossilRatio ?? 0,
      isEstimated: snapshot.estimatedFlag,
    } : null,
  }

  auditIngestionResult(result)
  return result
}

/**
 * Ingest all mapped US regions concurrently.
 * Returns an array of results for monitoring.
 */
export async function ingestAllRegions(): Promise<EIA930IngestionResult[]> {
  const baCodes = getAllBACodes()
  const regions = baCodes.map((code) => baCodeToRegion(code)).filter((r): r is string => r != null)

  logger.debug({ count: regions.length }, '[grid-ingestion] starting batch ingest')

  const results = await Promise.allSettled(regions.map((r) => ingestRegion(r)))

  return results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : {
          region: regions[i],
          balancingAuthority: regions[i],
          timestamp: new Date().toISOString(),
          balance: null,
          interchange: null,
          fuelMix: null,
          error: String(r.reason),
        },
  )
}

/**
 * Start the EIA-930 ingestion poller.
 * Safe to call multiple times — only one timer is active.
 *
 * Interval is configurable via EIA930_POLLING_INTERVAL_MIN env var (default: 5).
 */
export function startIngestionPoller(): void {
  if (pollerTimer) return

  // Check if EIA-930 key is configured — silently skip if not
  if (!env.EIA930_API_KEY) {
    logger.debug('[grid-ingestion] EIA930_API_KEY not configured — poller disabled')
    return
  }

  const intervalMin = parseInt(process.env.EIA930_POLLING_INTERVAL_MIN ?? '5', 10)
  const intervalMs = Math.max(intervalMin, 1) * 60 * 1000

  logger.info({ intervalMin }, '[grid-ingestion] starting EIA-930 poller')

  // Run immediately on startup, then on interval
  void ingestAllRegions()

  pollerTimer = setInterval(() => {
    void ingestAllRegions()
  }, intervalMs)

  // Prevent the timer from blocking graceful shutdown
  if (pollerTimer.unref) pollerTimer.unref()
}

/**
 * Stop the ingestion poller.
 */
export function stopIngestionPoller(): void {
  if (pollerTimer) {
    clearInterval(pollerTimer)
    pollerTimer = null
    logger.debug('[grid-ingestion] poller stopped')
  }
}
