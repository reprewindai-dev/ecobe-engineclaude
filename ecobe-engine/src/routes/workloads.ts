/**
 * Workloads Route — POST /api/v1/workloads/complete
 *
 * Called by workload producers (e.g. DEKES) after a routed workload finishes
 * executing. Closes the routing loop:
 *
 *   1. Marks the DecisionLease as EXECUTED (or DRIFT_BLOCKED if expired).
 *   2. Non-blocking: reconciles forecast actuals for the execution region,
 *      feeding the actual carbon intensity back into the 30-day rolling
 *      scorecard that improves future routing decisions.
 *   3. Updates DekesWorkload record when source === 'DEKES'.
 *   4. Writes a governance audit log entry.
 *
 * This is the feedback endpoint that turns ECOBE into a learning system:
 * every completed workload makes the next routing decision more accurate.
 */

import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/db'
import { writeAuditLog } from '../lib/governance/audit'
import { reconcileForecastActuals } from '../lib/forecast-scorecard'
import { logger } from '../lib/logger'

const router = Router()

const workloadCompleteSchema = z.object({
  /** ID returned by POST /api/v1/route/green (decision_id / lease_id) */
  decision_id:    z.string().min(1),
  organizationId: z.string().optional(),
  /** "DEKES" | "API" | "CLI" — identifies the workload producer */
  source:          z.string().optional(),
  workloadType:    z.string().optional(),
  /** Region where the workload actually executed */
  executionRegion: z.string().min(1),
  /** ISO-8601 timestamp when execution started */
  executionStart:  z.string().datetime(),
  durationMinutes: z.number().positive().optional(),
  status:          z.enum(['completed', 'failed', 'cancelled']),
  /**
   * Actual carbon intensity observed during execution.
   * When provided, this is fed into the forecast scorecard reconciler —
   * updating MAE/MAPE metrics and improving future routing accuracy.
   */
  actualCarbonIntensityGPerKwh: z.number().nonnegative().optional(),
})

router.post('/complete', async (req, res) => {
  try {
    const body = workloadCompleteSchema.parse(req.body)

    // Org context — header takes precedence over body
    const orgId: string | undefined =
      (req as any).resolvedOrgId
      ?? (req.headers['x-organization-id'] as string | undefined)
      ?? body.organizationId

    // 1. Mark lease EXECUTED (non-fatal if lease not found — not all callers use leases)
    const lease = await (prisma as any).decisionLease.findUnique({
      where: { id: body.decision_id },
    })

    if (lease) {
      const now = new Date()
      const expired = now > new Date(lease.leaseExpiresAt)
      await (prisma as any).decisionLease.update({
        where: { id: body.decision_id },
        data: {
          status:             expired ? 'DRIFT_BLOCKED' : 'EXECUTED',
          revalidatedAt:      now,
          revalidationAction: expired ? 'deny'             : 'execute',
          revalidationReason: expired ? 'executed_after_lease_expiry' : 'workload_completed',
        },
      })
    }

    // 2. Non-blocking: reconcile forecast actuals to improve future scorecard accuracy
    if (body.actualCarbonIntensityGPerKwh != null) {
      void reconcileForecastActuals(
        body.executionRegion,
        new Date(body.executionStart),
        body.actualCarbonIntensityGPerKwh,
      ).catch(() => {})
    }

    // 3. Update DekesWorkload record if source is DEKES
    if (body.source === 'DEKES') {
      await (prisma as any).dekesWorkload.updateMany({
        where: { dekesQueryId: body.decision_id, status: 'PENDING' },
        data: {
          status:      body.status === 'completed' ? 'COMPLETED' : body.status.toUpperCase(),
          completedAt: new Date(),
        },
      }).catch(() => {})
    }

    // Derive lease status for response (use current time, after the update)
    const leaseStatus: string = lease
      ? (new Date() > new Date(lease.leaseExpiresAt) ? 'DRIFT_BLOCKED' : 'EXECUTED')
      : 'not_found'

    // 4. Governance audit log (non-blocking)
    void writeAuditLog({
      organizationId: orgId,
      actorType: 'API_KEY',
      action: 'DECISION_CREATED',
      entityType: 'DecisionLease',
      entityId: body.decision_id,
      payload: {
        event:          'WORKLOAD_COMPLETED',
        executionRegion: body.executionRegion,
        executionStart:  body.executionStart,
        durationMinutes: body.durationMinutes ?? null,
        status:          body.status,
        source:          body.source ?? null,
        workloadType:    body.workloadType ?? null,
        leaseStatus,
        executedAfterExpiry: leaseStatus === 'DRIFT_BLOCKED',
        actualCarbonIntensityGPerKwh: body.actualCarbonIntensityGPerKwh ?? null,
      },
      result: body.status === 'completed' ? 'SUCCESS' : 'FAILURE',
    })

    return res.json({
      ok: true,
      decision_id: body.decision_id,
      leaseStatus,
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    logger.error({ err: error }, 'Workload complete error')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
