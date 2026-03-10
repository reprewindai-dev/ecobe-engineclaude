/**
 * ECOBE Integrations API
 *
 * GET  /api/v1/integrations/dekes/summary        — handoff stats for dashboard
 * GET  /api/v1/integrations/dekes/events         — recent handoff list
 * POST /api/v1/integrations/dekes/handoff-status — DEKES → ECOBE status callback
 */

import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/db'

const router = Router()

// ─── DEKES → ECOBE Status Callback ───────────────────────────────────────────

const handoffStatusSchema = z.object({
  handoffId:      z.string().min(1),
  status:         z.enum(['queued', 'processing', 'processed', 'ignored', 'failed']),
  classification: z.enum(['opportunity', 'informational', 'risk', 'no_action']).optional(),
  priority:       z.enum(['low', 'medium', 'high', 'critical']).optional(),
  actionCreated:  z.boolean().optional(),
  actionType:     z.string().optional(),
  actionId:       z.string().optional(),
  summary:        z.string().optional(),
  updatedAt:      z.string().datetime().optional(),
  metadata:       z.unknown().optional(),
})

/**
 * POST /api/v1/integrations/dekes/handoff-status
 *
 * Called by DEKES to update the processing status of a previously received handoff.
 * Auth: standard ECOBE API key (same requireApiKey middleware as all /api/v1/* routes).
 *
 * Example request:
 * {
 *   "handoffId": "hof_1741234567_abc123",
 *   "status": "processed",
 *   "classification": "opportunity",
 *   "priority": "high",
 *   "actionCreated": true,
 *   "actionType": "sales_followup",
 *   "actionId": "act_789"
 * }
 */
router.post('/dekes/handoff-status', async (req, res) => {
  try {
    const body = handoffStatusSchema.parse(req.body)

    const existing = await (prisma as any).dekesHandoff.findUnique({
      where:  { handoffId: body.handoffId },
      select: { id: true },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Handoff not found', handoffId: body.handoffId })
    }

    await (prisma as any).dekesHandoff.update({
      where: { handoffId: body.handoffId },
      data: {
        status:             body.status,
        dekesClassification: body.classification ?? undefined,
        dekesActionType:    body.actionType ?? undefined,
        dekesActionId:      body.actionId   ?? undefined,
        processedAt:        body.status === 'processed' ? new Date() : undefined,
        failedAt:           body.status === 'failed'    ? new Date() : undefined,
      },
    })

    return res.json({ ok: true, handoffId: body.handoffId, status: body.status })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    console.error('handoff-status error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ─── ECOBE Dashboard — DEKES Integration Summary ─────────────────────────────

/**
 * GET /api/v1/integrations/dekes/summary
 *
 * Returns aggregate handoff stats for the ECOBE DEKES Integration dashboard panel.
 *
 * Example response:
 * {
 *   "total": 47,
 *   "byStatus":    { "queued": 2, "processing": 8, "processed": 34, "ignored": 2, "failed": 1 },
 *   "byEventType": { "BUDGET_WARNING": 21, "BUDGET_EXCEEDED": 6, "POLICY_DELAY": 20 },
 *   "businessActivation": { "opportunities": 14, "actionsCreated": 9, "highPriorityOrgs": 3 }
 * }
 */
router.get('/dekes/summary', async (_req, res) => {
  try {
    const [rows, byEventType, opportunities, actions] = await Promise.all([
      // COUNT GROUP BY status
      (prisma as any).dekesHandoff.groupBy({
        by: ['status'],
        _count: { _all: true },
      }) as Promise<Array<{ status: string; _count: { _all: number } }>>,

      // COUNT GROUP BY eventType
      (prisma as any).dekesHandoff.groupBy({
        by: ['eventType'],
        _count: { _all: true },
      }) as Promise<Array<{ eventType: string; _count: { _all: number } }>>,

      // Count opportunity classifications
      (prisma as any).dekesHandoff.count({
        where: { dekesClassification: 'opportunity' },
      }) as Promise<number>,

      // Count rows where DEKES created an action
      (prisma as any).dekesHandoff.count({
        where: { dekesActionId: { not: null } },
      }) as Promise<number>,
    ])

    const byStatus = Object.fromEntries(
      rows.map((r) => [r.status, r._count._all]),
    )
    const byEventTypeMap = Object.fromEntries(
      byEventType.map((r) => [r.eventType, r._count._all]),
    )

    const total = Object.values(byStatus as Record<string, number>).reduce((a, b) => a + b, 0)

    // Distinct high-priority orgs that triggered any handoff
    const highPriorityOrgsResult = await (prisma as any).dekesHandoff.findMany({
      where:   { severity: { in: ['high', 'critical'] }, organizationId: { not: null } },
      select:  { organizationId: true },
      distinct: ['organizationId'],
    }) as Array<{ organizationId: string }>

    return res.json({
      total,
      byStatus,
      byEventType: byEventTypeMap,
      businessActivation: {
        opportunities:     opportunities,
        actionsCreated:    actions,
        highPriorityOrgs:  highPriorityOrgsResult.length,
      },
    })
  } catch (error: any) {
    console.error('integrations/dekes/summary error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ─── ECOBE Dashboard — Recent DEKES Handoffs Table ───────────────────────────

const eventsQuerySchema = z.object({
  limit:     z.coerce.number().int().min(1).max(100).optional().default(20),
  eventType: z.string().optional(),
  status:    z.string().optional(),
})

/**
 * GET /api/v1/integrations/dekes/events
 *
 * Returns recent handoffs for the dashboard handoffs table and detail drawer.
 * Query params: limit (default 20), eventType, status
 */
router.get('/dekes/events', async (req, res) => {
  try {
    const query = eventsQuerySchema.parse(req.query)

    const where: Record<string, unknown> = {}
    if (query.eventType) where['eventType'] = query.eventType
    if (query.status)    where['status']    = query.status

    const events = await (prisma as any).dekesHandoff.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take:    query.limit,
      select: {
        id:                  true,
        handoffId:           true,
        organizationId:      true,
        decisionId:          true,
        decisionFrameId:     true,
        eventType:           true,
        severity:            true,
        status:              true,
        dekesClassification: true,
        dekesActionType:     true,
        dekesActionId:       true,
        payloadJson:         true,
        sentAt:              true,
        processedAt:         true,
        failedAt:            true,
        errorMessage:        true,
        createdAt:           true,
      },
    }) as Array<Record<string, unknown>>

    // Attach replay and dashboard links for the detail drawer
    const enriched = events.map((e) => ({
      ...e,
      replayUrl:    e.decisionFrameId ? `/api/v1/route/${e.decisionFrameId}/replay`   : null,
      dashboardUrl: e.decisionId      ? `/dashboard/decisions/${e.decisionId}`         : null,
    }))

    return res.json({ events: enriched, count: enriched.length })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid query params', details: error.errors })
    }
    console.error('integrations/dekes/events error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
