/**
 * Doctrine Write Path — POST /api/v1/doctrine/propose
 *                       POST /api/v1/doctrine/approve/:proposalId
 *                       POST /api/v1/doctrine/reject/:proposalId
 *                       POST /api/v1/doctrine/rollback/:versionId
 *                       GET  /api/v1/doctrine/active
 *                       GET  /api/v1/doctrine/history
 */
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/db'
import { operatorGuard } from '../middleware/operator-auth'
import { getActiveDoctrine, invalidateDoctrine } from '../lib/doctrine/doctrine-cache'

const router = Router()

// ─── Schemas ──────────────────────────────────────────────────────────────────

const ProposeSchema = z.object({
  carbonThreshold: z.number().min(0).max(1000).nullish(),
  waterThreshold: z.number().min(0).max(1000).nullish(),
  latencyBudget: z.number().min(0).max(60000).nullish(),
  costCeiling: z.number().min(0).nullish(),
  mode: z.enum(['strict', 'balanced', 'permissive']).default('balanced'),
  justification: z.string().min(10).max(2000),
  effectiveAt: z.string().datetime().optional(),
})

const ApproveSchema = z.object({
  note: z.string().max(1000).optional(),
})

const RejectSchema = z.object({
  rejectionReason: z.string().min(5).max(1000),
})

const RollbackSchema = z.object({
  reason: z.string().min(5).max(1000),
})

// ─── POST /propose ────────────────────────────────────────────────────────────

router.post('/propose', operatorGuard('operator'), async (req, res) => {
  const parse = ProposeSchema.safeParse(req.body)
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid proposal', issues: parse.error.issues })
  }

  const operator = req.operator!
  const data = parse.data

  const proposal = await prisma.doctrineProposal.create({
    data: {
      orgId: operator.orgId,
      proposedById: operator.id,
      carbonThreshold: data.carbonThreshold ?? null,
      waterThreshold: data.waterThreshold ?? null,
      latencyBudget: data.latencyBudget ?? null,
      costCeiling: data.costCeiling ?? null,
      mode: data.mode,
      justification: data.justification,
      effectiveAt: data.effectiveAt ? new Date(data.effectiveAt) : null,
      status: 'PENDING_APPROVAL',
    },
  })

  return res.status(201).json({
    proposalId: proposal.id,
    status: proposal.status,
    message: 'Proposal created — awaiting approval by a different operator with admin role',
  })
})

// ─── POST /approve/:proposalId ────────────────────────────────────────────────

router.post('/approve/:proposalId', operatorGuard('admin'), async (req, res) => {
  const { proposalId } = req.params
  const parse = ApproveSchema.safeParse(req.body)
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid body', issues: parse.error.issues })
  }

  const operator = req.operator!

  const proposal = await prisma.doctrineProposal.findUnique({ where: { id: proposalId } })
  if (!proposal) return res.status(404).json({ error: 'Proposal not found', code: 'PROPOSAL_NOT_FOUND' })
  if (proposal.orgId !== operator.orgId) return res.status(403).json({ error: 'Org mismatch', code: 'ORG_MISMATCH' })
  if (proposal.status !== 'PENDING_APPROVAL') {
    return res.status(409).json({ error: `Proposal is already ${proposal.status}`, code: 'PROPOSAL_NOT_PENDING' })
  }

  // Enforce 2-person rule — approver must differ from proposer
  if (proposal.proposedById === operator.id) {
    return res.status(403).json({
      error: 'Approver cannot be the same operator who proposed',
      code: 'SELF_APPROVAL_FORBIDDEN',
    })
  }

  const now = new Date()

  // Supersede previous active version
  await prisma.doctrineVersion.updateMany({
    where: { orgId: operator.orgId, status: 'active' },
    data: { status: 'superseded', supersededAt: now },
  })

  const version = await prisma.$transaction(async (tx) => {
    await tx.doctrineProposal.update({
      where: { id: proposalId },
      data: { status: 'APPROVED', approvedById: operator.id, reviewedAt: now },
    })

    return tx.doctrineVersion.create({
      data: {
        orgId: operator.orgId,
        proposalId,
        proposedById: proposal.proposedById,
        approvedById: operator.id,
        status: 'active',
        carbonThreshold: proposal.carbonThreshold,
        waterThreshold: proposal.waterThreshold,
        latencyBudget: proposal.latencyBudget,
        costCeiling: proposal.costCeiling,
        mode: proposal.mode,
        justification: proposal.justification,
        activatedAt: proposal.effectiveAt ?? now,
      },
    })
  })

  await invalidateDoctrine(operator.orgId)

  return res.status(200).json({
    doctrineVersionId: version.id,
    status: 'active',
    activatedAt: version.activatedAt,
    message: 'Doctrine approved and activated — engine will pick up within 60s',
  })
})

// ─── POST /reject/:proposalId ─────────────────────────────────────────────────

router.post('/reject/:proposalId', operatorGuard('admin'), async (req, res) => {
  const { proposalId } = req.params
  const parse = RejectSchema.safeParse(req.body)
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid body', issues: parse.error.issues })
  }

  const operator = req.operator!
  const proposal = await prisma.doctrineProposal.findUnique({ where: { id: proposalId } })
  if (!proposal) return res.status(404).json({ error: 'Proposal not found', code: 'PROPOSAL_NOT_FOUND' })
  if (proposal.orgId !== operator.orgId) return res.status(403).json({ error: 'Org mismatch', code: 'ORG_MISMATCH' })
  if (proposal.status !== 'PENDING_APPROVAL') {
    return res.status(409).json({ error: `Proposal is already ${proposal.status}`, code: 'PROPOSAL_NOT_PENDING' })
  }

  await prisma.doctrineProposal.update({
    where: { id: proposalId },
    data: {
      status: 'REJECTED',
      rejectedById: operator.id,
      rejectionReason: parse.data.rejectionReason,
      reviewedAt: new Date(),
    },
  })

  return res.status(200).json({ proposalId, status: 'REJECTED' })
})

// ─── POST /rollback/:versionId ────────────────────────────────────────────────

router.post('/rollback/:versionId', operatorGuard('admin'), async (req, res) => {
  const { versionId } = req.params
  const parse = RollbackSchema.safeParse(req.body)
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid body', issues: parse.error.issues })
  }

  const operator = req.operator!
  const version = await prisma.doctrineVersion.findUnique({ where: { id: versionId } })
  if (!version) return res.status(404).json({ error: 'DoctrineVersion not found', code: 'VERSION_NOT_FOUND' })
  if (version.orgId !== operator.orgId) return res.status(403).json({ error: 'Org mismatch', code: 'ORG_MISMATCH' })
  if (version.status !== 'active') {
    return res.status(409).json({ error: 'Only active versions can be rolled back', code: 'VERSION_NOT_ACTIVE' })
  }

  const now = new Date()

  // Find previous active-eligible version
  const previous = await prisma.doctrineVersion.findFirst({
    where: { orgId: operator.orgId, status: 'superseded', id: { not: versionId } },
    orderBy: { activatedAt: 'desc' },
  })

  await prisma.$transaction(async (tx) => {
    await tx.doctrineVersion.update({
      where: { id: versionId },
      data: {
        status: 'rolled_back',
        rolledBackAt: now,
        rolledBackById: operator.id,
      },
    })
    if (previous) {
      await tx.doctrineVersion.update({
        where: { id: previous.id },
        data: { status: 'active', supersededAt: null },
      })
    }
  })

  await invalidateDoctrine(operator.orgId)

  return res.status(200).json({
    rolledBackVersionId: versionId,
    restoredVersionId: previous?.id ?? null,
    message: previous
      ? `Rolled back — version ${previous.id} restored as active`
      : 'Rolled back — no previous version, engine will use hardcoded defaults',
  })
})

// ─── GET /active ──────────────────────────────────────────────────────────────

router.get('/active', operatorGuard('viewer'), async (req, res) => {
  const doctrine = await getActiveDoctrine(req.operator!.orgId)
  if (!doctrine) {
    return res.status(200).json({ active: null, message: 'No doctrine configured — engine using hardcoded defaults' })
  }
  return res.status(200).json({ active: doctrine })
})

// ─── GET /history ─────────────────────────────────────────────────────────────

router.get('/history', operatorGuard('viewer'), async (req, res) => {
  const versions = await prisma.doctrineVersion.findMany({
    where: { orgId: req.operator!.orgId },
    orderBy: { activatedAt: 'desc' },
    take: 50,
    select: {
      id: true,
      status: true,
      mode: true,
      carbonThreshold: true,
      waterThreshold: true,
      latencyBudget: true,
      costCeiling: true,
      justification: true,
      activatedAt: true,
      supersededAt: true,
      rolledBackAt: true,
      proposedById: true,
      approvedById: true,
      rolledBackById: true,
    },
  })
  return res.status(200).json({ versions })
})

export default router
