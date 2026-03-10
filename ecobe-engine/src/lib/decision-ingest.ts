/**
 * decision-ingest.ts — shared write path for DashboardRoutingDecision.
 *
 * Called by every routing entry point (POST /route/green, DEKES optimize, CI route)
 * as a fire-and-forget auto-write. Also used by POST /api/v1/decisions for client-push.
 *
 * Deduplication:
 *   If `decisionFrameId` is provided and a row with that ID already exists, the call
 *   is a no-op (returns { skipped: true }). This prevents duplicate rows when the
 *   engine auto-writes and a client also calls POST /decisions for the same decision.
 *
 * Post-write side-effects (all fire-and-forget, never block the caller):
 *   - writeAuditLog  — DECISION_CREATED entry in the governance chain
 *   - detectAnomaly  — z-score check against org rolling mean
 *   - consumeBudget  — decrement org carbon budget if configured
 */

import { prisma } from './db'
import { writeAuditLog } from './governance/audit'
import { detectAnomaly } from './governance/watchtower'
import { consumeBudget } from './carbon-budget'

export interface IngestDecisionInput {
  organizationId?: string
  decisionFrameId?: string
  baselineRegion: string
  chosenRegion: string
  carbonIntensityBaselineGPerKwh?: number
  carbonIntensityChosenGPerKwh?: number
  explanation?: string
  fallbackUsed?: boolean
  sourceUsed?: string
  workloadName?: string
  opName?: string
  estimatedKwh?: number
  co2BaselineG?: number
  co2ChosenG?: number
  requestCount?: number
  latencyEstimateMs?: number
  dataFreshnessSeconds?: number
  meta?: Record<string, unknown>
}

export async function ingestDecision(
  input: IngestDecisionInput,
): Promise<{ id: string; skipped: boolean }> {
  // Skip if a row for this decision already exists (engine auto-write already ran)
  if (input.decisionFrameId) {
    const existing = await (prisma as any).dashboardRoutingDecision.findUnique({
      where: { decisionFrameId: input.decisionFrameId },
      select: { id: true },
    })
    if (existing) return { id: existing.id as string, skipped: true }
  }

  const created = await (prisma as any).dashboardRoutingDecision.create({
    data: {
      organizationId:                input.organizationId ?? null,
      decisionFrameId:               input.decisionFrameId ?? null,
      baselineRegion:                input.baselineRegion,
      chosenRegion:                  input.chosenRegion,
      carbonIntensityBaselineGPerKwh: input.carbonIntensityBaselineGPerKwh ?? null,
      carbonIntensityChosenGPerKwh:   input.carbonIntensityChosenGPerKwh ?? null,
      reason:                        input.explanation ?? null,
      fallbackUsed:                  input.fallbackUsed ?? false,
      workloadName:                  input.workloadName ?? null,
      opName:                        input.opName ?? null,
      estimatedKwh:                  input.estimatedKwh ?? null,
      co2BaselineG:                  input.co2BaselineG ?? null,
      co2ChosenG:                    input.co2ChosenG ?? null,
      requestCount:                  input.requestCount ?? 1,
      latencyEstimateMs:             input.latencyEstimateMs ?? null,
      dataFreshnessSeconds:          input.dataFreshnessSeconds ?? null,
      meta:                          (input.meta ?? {}) as any,
    },
    select: {
      id: true,
      co2BaselineG: true,
      co2ChosenG: true,
      carbonIntensityChosenGPerKwh: true,
    },
  })

  const carbonSavedG = (created.co2BaselineG ?? 0) - (created.co2ChosenG ?? 0)

  void writeAuditLog({
    organizationId: input.organizationId,
    actorType: 'API_KEY',
    action: 'DECISION_CREATED',
    entityType: 'DashboardRoutingDecision',
    entityId: created.id as string,
    payload: {
      baselineRegion: input.baselineRegion,
      chosenRegion: input.chosenRegion,
      co2BaselineG: created.co2BaselineG,
      co2ChosenG: created.co2ChosenG,
      source_used: input.sourceUsed ?? null,
      fallback_used: input.fallbackUsed ?? false,
      decisionFrameId: input.decisionFrameId ?? null,
    },
    result: 'SUCCESS',
    carbonSavedG,
    riskTier: 'LOW',
  })

  void detectAnomaly({
    organizationId: input.organizationId,
    carbonIntensityChosenGPerKwh: created.carbonIntensityChosenGPerKwh ?? 0,
    entityId: created.id as string,
    entityType: 'DashboardRoutingDecision',
  })

  if (input.organizationId && (input.co2ChosenG ?? 0) > 0) {
    void consumeBudget(input.organizationId, input.co2ChosenG ?? 0).catch(() => {})
  }

  return { id: created.id as string, skipped: false }
}
