import { Router } from 'express'
import { z } from 'zod'
import {
  proposeDoctrine,
  approveDoctrine,
  rejectDoctrine,
  rollbackDoctrine,
  getDoctrineHistory,
  getPendingProposals,
  getActiveDoctrine,
} from '../lib/doctrine/doctrine-service'
import { operatorAuthMiddleware, requireRole } from '../middleware/operator-auth'

const router = Router()

// All doctrine routes require operator authentication
router.use(operatorAuthMiddleware)

// ---------------------------------------------------------------------------
// GET /api/v1/doctrine/active
// Returns the currently active doctrine for the operator's org
// ---------------------------------------------------------------------------
router.get('/active', async (req, res) => {
  try {
    const doctrine = await getActiveDoctrine(req.operator!.orgId)
    return res.json({
      success: true,
      data: doctrine ?? { status: 'no_active_doctrine', fallback: 'co2_router_doctrine_v1' },
    })
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'INTERNAL', message: err.message } })
  }
})

// ---------------------------------------------------------------------------
// GET /api/v1/doctrine/history
// Returns versioned doctrine history for the org
// ---------------------------------------------------------------------------
router.get('/history', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 20
    const history = await getDoctrineHistory(req.operator!.orgId, Math.min(limit, 100))
    return res.json({ success: true, data: history })
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'INTERNAL', message: err.message } })
  }
})

// ---------------------------------------------------------------------------
// GET /api/v1/doctrine/proposals/pending
// Returns pending proposals for the org (admin/operator can view)
// ---------------------------------------------------------------------------
router.get('/proposals/pending', async (req, res) => {
  try {
    const proposals = await getPendingProposals(req.operator!.orgId)
    return res.json({ success: true, data: proposals })
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'INTERNAL', message: err.message } })
  }
})

const proposeSchema = z.object({
  carbonThreshold: z.number().min(0).max(2000).optional(),
  waterThreshold: z.number().min(0).max(1000).optional(),
  latencyBudget: z.number().min(0).max(60000).optional(),
  costCeiling: z.number().min(0).optional(),
  mode: z.enum(['strict', 'balanced', 'permissive']).default('balanced'),
  justification: z.string().min(10).max(2000),
  effectiveAt: z.string().datetime().optional(),
})

// ---------------------------------------------------------------------------
// POST /api/v1/doctrine/propose
// Operator or admin proposes a doctrine change (does NOT activate immediately)
// ---------------------------------------------------------------------------
router.post('/propose', requireRole('operator'), async (req, res) => {
  const parsed = proposeSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
    })
  }

  try {
    const proposal = await proposeDoctrine({
      operatorId: req.operator!.id,
      orgId: req.operator!.orgId,
      ...parsed.data,
      effectiveAt: parsed.data.effectiveAt ? new Date(parsed.data.effectiveAt) : undefined,
    })
    return res.status(201).json({ success: true, data: proposal })
  } catch (err: any) {
    const status = err.message.startsWith('INSUFFICIENT_ROLE') ? 403 : 400
    return res.status(status).json({ success: false, error: { code: err.message } })
  }
})

// ---------------------------------------------------------------------------
// POST /api/v1/doctrine/approve/:proposalId
// Admin approves a pending proposal — activates it immediately (or at effectiveAt)
// Cannot be the same person who proposed it.
// ---------------------------------------------------------------------------
router.post('/approve/:proposalId', requireRole('admin'), async (req, res) => {
  try {
    const version = await approveDoctrine({
      proposalId: req.params.proposalId,
      approverId: req.operator!.id,
    })
    return res.json({ success: true, data: version })
  } catch (err: any) {
    const errorMap: Record<string, number> = {
      PROPOSAL_NOT_FOUND: 404,
      PROPOSAL_NOT_PENDING: 409,
      SELF_APPROVAL_FORBIDDEN: 403,
      INSUFFICIENT_ROLE: 403,
      ORG_MISMATCH: 403,
    }
    const status = errorMap[err.message] ?? 400
    return res.status(status).json({ success: false, error: { code: err.message } })
  }
})

// ---------------------------------------------------------------------------
// POST /api/v1/doctrine/reject/:proposalId
// Admin rejects a pending proposal with a required reason.
// ---------------------------------------------------------------------------
router.post('/reject/:proposalId', requireRole('admin'), async (req, res) => {
  const { reason } = req.body
  if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
    return res.status(400).json({
      success: false,
      error: { code: 'REASON_REQUIRED', message: 'rejection reason must be at least 5 characters' },
    })
  }

  try {
    const proposal = await rejectDoctrine({
      proposalId: req.params.proposalId,
      rejecterId: req.operator!.id,
      reason: reason.trim(),
    })
    return res.json({ success: true, data: proposal })
  } catch (err: any) {
    const errorMap: Record<string, number> = {
      PROPOSAL_NOT_FOUND: 404,
      PROPOSAL_NOT_PENDING: 409,
      INSUFFICIENT_ROLE: 403,
      ORG_MISMATCH: 403,
    }
    const status = errorMap[err.message] ?? 400
    return res.status(status).json({ success: false, error: { code: err.message } })
  }
})

// ---------------------------------------------------------------------------
// POST /api/v1/doctrine/rollback/:versionId
// Admin rolls back the active version — restores previous superseded version.
// ---------------------------------------------------------------------------
router.post('/rollback/:versionId', requireRole('admin'), async (req, res) => {
  try {
    const result = await rollbackDoctrine({
      versionId: req.params.versionId,
      requesterId: req.operator!.id,
    })
    return res.json({ success: true, data: result })
  } catch (err: any) {
    const errorMap: Record<string, number> = {
      VERSION_NOT_FOUND: 404,
      VERSION_NOT_ACTIVE: 409,
      INSUFFICIENT_ROLE: 403,
      ORG_MISMATCH: 403,
    }
    const status = errorMap[err.message] ?? 400
    return res.status(status).json({ success: false, error: { code: err.message } })
  }
})

export { router as doctrineRouter }
