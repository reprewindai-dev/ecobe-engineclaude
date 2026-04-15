import { createHash } from 'crypto'
import { prisma } from '../db'

export type DoctrineMode = 'strict' | 'balanced' | 'permissive'

export interface ActiveDoctrine {
  versionId: string
  orgId: string
  carbonThreshold: number | null
  waterThreshold: number | null
  latencyBudget: number | null
  costCeiling: number | null
  mode: DoctrineMode
  activatedAt: Date
}

// In-process cache — invalidated on every approve/rollback
const doctrineCache = new Map<string, { doctrine: ActiveDoctrine; cachedAt: number }>()
const CACHE_TTL_MS = 30_000 // 30s

export function invalidateDoctrineCache(orgId: string) {
  doctrineCache.delete(orgId)
}

/**
 * Returns the currently active DoctrineVersion for an org.
 * Falls back to engine defaults if no version has been approved yet.
 */
export async function getActiveDoctrine(orgId: string): Promise<ActiveDoctrine | null> {
  const cached = doctrineCache.get(orgId)
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.doctrine
  }

  const version = await prisma.doctrineVersion.findFirst({
    where: { orgId, status: 'active' },
    orderBy: { activatedAt: 'desc' },
  })

  if (!version) return null

  const doctrine: ActiveDoctrine = {
    versionId: version.id,
    orgId: version.orgId,
    carbonThreshold: version.carbonThreshold,
    waterThreshold: version.waterThreshold,
    latencyBudget: version.latencyBudget,
    costCeiling: version.costCeiling,
    mode: version.mode as DoctrineMode,
    activatedAt: version.activatedAt,
  }

  doctrineCache.set(orgId, { doctrine, cachedAt: Date.now() })
  return doctrine
}

/**
 * Resolves the doctrine version string used in CIDecision audit records.
 * Returns the active version ID or the static fallback.
 */
export async function resolveDoctrineVersionLabel(orgId: string): Promise<string> {
  const active = await getActiveDoctrine(orgId)
  return active ? `doctrine_v_${active.versionId}` : 'co2_router_doctrine_v1'
}

export interface ProposeDoctrineInput {
  operatorId: string
  orgId: string
  carbonThreshold?: number
  waterThreshold?: number
  latencyBudget?: number
  costCeiling?: number
  mode?: DoctrineMode
  justification: string
  effectiveAt?: Date
}

export async function proposeDoctrine(input: ProposeDoctrineInput) {
  const operator = await prisma.operatorIdentity.findUnique({
    where: { id: input.operatorId },
  })

  if (!operator || !operator.active) {
    throw new Error('OPERATOR_NOT_FOUND')
  }
  if (operator.orgId !== input.orgId) {
    throw new Error('ORG_MISMATCH')
  }
  if (operator.role === 'viewer') {
    throw new Error('INSUFFICIENT_ROLE: viewer cannot propose doctrine changes')
  }

  return prisma.doctrineProposal.create({
    data: {
      proposedById: input.operatorId,
      orgId: input.orgId,
      carbonThreshold: input.carbonThreshold ?? null,
      waterThreshold: input.waterThreshold ?? null,
      latencyBudget: input.latencyBudget ?? null,
      costCeiling: input.costCeiling ?? null,
      mode: input.mode ?? 'balanced',
      justification: input.justification,
      status: 'pending_approval',
      effectiveAt: input.effectiveAt ?? null,
    },
  })
}

export interface ApproveDoctrineInput {
  proposalId: string
  approverId: string
}

export async function approveDoctrine(input: ApproveDoctrineInput) {
  const proposal = await prisma.doctrineProposal.findUnique({
    where: { id: input.proposalId },
    include: { proposedBy: true },
  })

  if (!proposal) throw new Error('PROPOSAL_NOT_FOUND')
  if (proposal.status !== 'pending_approval') throw new Error('PROPOSAL_NOT_PENDING')

  const approver = await prisma.operatorIdentity.findUnique({
    where: { id: input.approverId },
  })

  if (!approver || !approver.active) throw new Error('APPROVER_NOT_FOUND')
  if (approver.role !== 'admin') throw new Error('INSUFFICIENT_ROLE: only admin can approve')
  if (approver.id === proposal.proposedById) throw new Error('SELF_APPROVAL_FORBIDDEN: proposer cannot approve own proposal')
  if (approver.orgId !== proposal.orgId) throw new Error('ORG_MISMATCH')

  return prisma.$transaction(async (tx) => {
    // Supersede all currently active versions for this org
    await tx.doctrineVersion.updateMany({
      where: { orgId: proposal.orgId, status: 'active' },
      data: { status: 'superseded', supersededAt: new Date() },
    })

    // Mark proposal approved
    await tx.doctrineProposal.update({
      where: { id: proposal.id },
      data: { status: 'approved', approvedById: input.approverId },
    })

    // Create the new active DoctrineVersion
    const version = await tx.doctrineVersion.create({
      data: {
        proposalId: proposal.id,
        orgId: proposal.orgId,
        proposedById: proposal.proposedById,
        approvedById: input.approverId,
        carbonThreshold: proposal.carbonThreshold,
        waterThreshold: proposal.waterThreshold,
        latencyBudget: proposal.latencyBudget,
        costCeiling: proposal.costCeiling,
        mode: proposal.mode,
        justification: proposal.justification,
        status: 'active',
        activatedAt: proposal.effectiveAt ?? new Date(),
      },
    })

    invalidateDoctrineCache(proposal.orgId)
    return version
  })
}

export interface RejectDoctrineInput {
  proposalId: string
  rejecterId: string
  reason: string
}

export async function rejectDoctrine(input: RejectDoctrineInput) {
  const proposal = await prisma.doctrineProposal.findUnique({
    where: { id: input.proposalId },
  })

  if (!proposal) throw new Error('PROPOSAL_NOT_FOUND')
  if (proposal.status !== 'pending_approval') throw new Error('PROPOSAL_NOT_PENDING')

  const rejecter = await prisma.operatorIdentity.findUnique({
    where: { id: input.rejecterId },
  })

  if (!rejecter || !rejecter.active) throw new Error('REJECTER_NOT_FOUND')
  if (rejecter.role !== 'admin') throw new Error('INSUFFICIENT_ROLE: only admin can reject')
  if (rejecter.orgId !== proposal.orgId) throw new Error('ORG_MISMATCH')

  return prisma.doctrineProposal.update({
    where: { id: input.proposalId },
    data: {
      status: 'rejected',
      rejectedById: input.rejecterId,
      rejectionReason: input.reason,
    },
  })
}

export interface RollbackDoctrineInput {
  versionId: string
  requesterId: string
}

export async function rollbackDoctrine(input: RollbackDoctrineInput) {
  const version = await prisma.doctrineVersion.findUnique({
    where: { id: input.versionId },
  })

  if (!version) throw new Error('VERSION_NOT_FOUND')
  if (version.status !== 'active') throw new Error('VERSION_NOT_ACTIVE')

  const requester = await prisma.operatorIdentity.findUnique({
    where: { id: input.requesterId },
  })

  if (!requester || !requester.active) throw new Error('REQUESTER_NOT_FOUND')
  if (requester.role !== 'admin') throw new Error('INSUFFICIENT_ROLE: only admin can rollback')
  if (requester.orgId !== version.orgId) throw new Error('ORG_MISMATCH')

  return prisma.$transaction(async (tx) => {
    // Mark current active version as rolled_back
    await tx.doctrineVersion.update({
      where: { id: version.id },
      data: { status: 'rolled_back', supersededAt: new Date() },
    })

    // Re-activate the most recent superseded version (if any)
    const previous = await tx.doctrineVersion.findFirst({
      where: { orgId: version.orgId, status: 'superseded' },
      orderBy: { activatedAt: 'desc' },
    })

    if (previous) {
      await tx.doctrineVersion.update({
        where: { id: previous.id },
        data: { status: 'active', supersededAt: null },
      })
    }

    invalidateDoctrineCache(version.orgId)
    return { rolledBack: version.id, restored: previous?.id ?? null }
  })
}

export async function getDoctrineHistory(orgId: string, limit = 20) {
  return prisma.doctrineVersion.findMany({
    where: { orgId },
    orderBy: { activatedAt: 'desc' },
    take: limit,
  })
}

export async function getPendingProposals(orgId: string) {
  return prisma.doctrineProposal.findMany({
    where: { orgId, status: 'pending_approval' },
    orderBy: { createdAt: 'desc' },
    include: { proposedBy: { select: { id: true, displayName: true, role: true } } },
  })
}

/**
 * Derives an operator ID from a raw API key string.
 * Used by the middleware to resolve identity from the request header.
 */
export function hashOperatorKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex')
}

export async function resolveOperatorFromKey(rawKey: string) {
  const keyHash = hashOperatorKey(rawKey)
  return prisma.operatorIdentity.findUnique({
    where: { keyHash },
  })
}
