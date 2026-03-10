/**
 * Grid Signal Audit
 *
 * Lightweight structured logger for grid signal events.
 * Uses the application logger (not the governance chain) since grid signals
 * are observability data, not compliance-critical governance events.
 *
 * All functions are fire-and-forget (no await required by callers).
 */

import { logger } from '../logger'
import type { GridSignalSnapshot, EIA930IngestionResult } from './types'

/** Log a successful grid signal assembly */
export function auditGridSignalAssembled(snapshot: GridSignalSnapshot): void {
  logger.info(
    {
      region: snapshot.region,
      ba: snapshot.balancingAuthority,
      quality: snapshot.signalQuality,
      source: snapshot.source,
      estimated: snapshot.estimatedFlag,
      synthetic: snapshot.syntheticFlag,
      carbonSpike: snapshot.carbonSpikeProbability,
      curtailment: snapshot.curtailmentProbability,
      leakage: snapshot.importCarbonLeakageScore,
      ramp: snapshot.loadRampDirection,
    },
    '[grid-signal] snapshot assembled',
  )
}

/** Log an EIA-930 ingestion result */
export function auditIngestionResult(result: EIA930IngestionResult): void {
  if (result.error) {
    logger.warn(
      { region: result.region, ba: result.balancingAuthority, error: result.error },
      '[grid-signal] ingestion error',
    )
  } else {
    logger.debug(
      {
        region: result.region,
        ba: result.balancingAuthority,
        hasBalance: result.balance != null,
        hasInterchange: result.interchange != null,
        hasFuelMix: result.fuelMix != null,
      },
      '[grid-signal] ingestion ok',
    )
  }
}

/** Log a cache miss that triggered a live fetch */
export function auditCacheMiss(region: string): void {
  logger.debug({ region }, '[grid-signal] cache miss — live fetch')
}

/** Log a stale signal warning (data older than expected) */
export function auditStaleSignal(region: string, ageMinutes: number): void {
  logger.warn({ region, ageMinutes }, '[grid-signal] stale data — EIA-930 may be delayed')
}
