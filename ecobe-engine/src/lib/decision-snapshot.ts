/**
 * DecisionSnapshot — persistence layer for deterministic routing replay.
 *
 * Called fire-and-forget from routeGreen() after a decision is made.
 * Stores everything needed to reconstruct the decision:
 *   - request inputs (regions, weights, constraints)
 *   - signal snapshot (intensity per region at decision time)
 *   - decision output (selected region, scores, explanation, provenance)
 *
 * Replay via: GET /api/v1/decisions/:id/replay
 */

import { prisma } from './db'
import { logger } from './logger'
import type { RoutingRequest, RoutingResult } from './green-routing'

export interface SignalSnapshot {
  [region: string]: {
    intensity: number
    source: string | null
    fallbackUsed: boolean
    disagreementFlag: boolean | null
  }
}

export async function saveDecisionSnapshot(opts: {
  decisionFrameId: string
  organizationId?: string
  request: RoutingRequest
  result: RoutingResult
  signalSnapshot: SignalSnapshot
  // Workload source context
  source?: string
  workloadType?: string
  policyMode?: string
  delayToleranceMinutes?: number
  predictedCleanWindow?: unknown | null
}): Promise<void> {
  const { decisionFrameId, organizationId, request, result, signalSnapshot } = opts

  // Derive baseline from alternatives + selected (worst of all candidates)
  const allIntensities = [
    result.carbonIntensity,
    ...result.alternatives.map((a) => a.carbonIntensity),
  ]
  const baselineIntensity = Math.max(...allIntensities)

  try {
    await (prisma as any).decisionSnapshot.create({
      data: {
        id: decisionFrameId,
        organizationId: organizationId ?? null,

        // Request inputs
        regions: request.preferredRegions,
        targetTime: request.targetTime ?? null,
        durationMinutes: request.durationMinutes ?? null,
        maxCarbonGPerKwh: request.maxCarbonGPerKwh ?? null,
        weights: {
          carbon: request.carbonWeight ?? 0.5,
          latency: request.latencyWeight ?? 0.2,
          cost: request.costWeight ?? 0.3,
        },

        // Signal snapshot
        signalSnapshot,

        // Decision output
        selectedRegion: result.selectedRegion,
        carbonIntensity: result.carbonIntensity,
        baselineIntensity,
        carbonDeltaGPerKwh: result.carbon_delta_g_per_kwh,
        qualityTier: result.qualityTier,
        forecastStability: result.forecast_stability ?? null,
        score: result.score,
        explanation: result.explanation,

        // Provenance
        sourceUsed: signalSnapshot[result.selectedRegion]?.source ?? null,
        referenceTime: request.targetTime ?? new Date(),
        fallbackUsed: signalSnapshot[result.selectedRegion]?.fallbackUsed ?? false,
        providerDisagreement: result.provider_disagreement?.flag ?? false,

        // Workload source context
        source:                opts.source ?? null,
        workloadType:          opts.workloadType ?? null,
        policyMode:            opts.policyMode ?? null,
        delayToleranceMinutes: opts.delayToleranceMinutes ?? null,
        predictedCleanWindow:  (opts.predictedCleanWindow ?? null) as any,
      },
    })
  } catch (err: any) {
    // Non-blocking — a snapshot write failure must never fail the routing response.
    // P2002 = unique constraint (duplicate decisionFrameId) — safe to ignore.
    if (err?.code !== 'P2002') {
      logger.warn({ err, decisionFrameId }, 'DecisionSnapshot write failed')
    }
  }
}
