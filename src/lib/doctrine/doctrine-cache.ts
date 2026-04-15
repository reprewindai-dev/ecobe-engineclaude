/**
 * Redis-backed doctrine cache.
 * The active DoctrineVersion for an org is cached under:
 *   doctrine:active:{orgId}
 * TTL: 60s — short enough to pick up approvals quickly.
 * On approval or rollback, invalidate immediately.
 */
import { redis } from '../cache'
import { prisma } from '../db'

export type ActiveDoctrine = {
  id: string
  orgId: string
  carbonThreshold: number | null
  waterThreshold: number | null
  latencyBudget: number | null
  costCeiling: number | null
  mode: string
  activatedAt: string
}

const TTL_SECONDS = 60

function cacheKey(orgId: string) {
  return `doctrine:active:${orgId}`
}

export async function getActiveDoctrine(orgId: string): Promise<ActiveDoctrine | null> {
  try {
    const cached = await redis.get(cacheKey(orgId))
    if (cached) return JSON.parse(cached) as ActiveDoctrine
  } catch {
    // Redis miss — fall through to DB
  }

  const version = await prisma.doctrineVersion.findFirst({
    where: { orgId, status: 'active' },
    orderBy: { activatedAt: 'desc' },
  })

  if (!version) return null

  const doc: ActiveDoctrine = {
    id: version.id,
    orgId: version.orgId,
    carbonThreshold: version.carbonThreshold,
    waterThreshold: version.waterThreshold,
    latencyBudget: version.latencyBudget,
    costCeiling: version.costCeiling,
    mode: version.mode,
    activatedAt: version.activatedAt.toISOString(),
  }

  await redis.set(cacheKey(orgId), JSON.stringify(doc), 'EX', TTL_SECONDS).catch(() => {})
  return doc
}

export async function invalidateDoctrine(orgId: string): Promise<void> {
  await redis.del(cacheKey(orgId)).catch(() => {})
}
