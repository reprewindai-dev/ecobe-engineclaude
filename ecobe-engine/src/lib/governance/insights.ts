import { createHash } from 'crypto'
import { prisma } from '../db'

/**
 * Investor-grade org carbon summary.
 * Cached via Prisma Accelerate (ttl=300s, swr=60s) when a prisma:// URL is used.
 */
export async function getOrgCarbonSummary(organizationId: string, windowDays = 30) {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)

  const [decisions, credits, emissions] = await Promise.all([
    (prisma as any).dashboardRoutingDecision.aggregate({
      where: { createdAt: { gte: since } },
      _count: { id: true },
      _sum: { co2BaselineG: true, co2ChosenG: true },
      cacheStrategy: { ttl: 300, swr: 60 },
    }),
    (prisma as any).carbonCredit.groupBy({
      by: ['status'],
      where: { organizationId, purchasedAt: { gte: since } },
      _sum: { amountCO2: true },
      cacheStrategy: { ttl: 300, swr: 60 },
    }),
    (prisma as any).emissionLog.aggregate({
      where: { organizationId, timestamp: { gte: since } },
      _sum: { emissionCO2: true, offsetCO2: true },
      cacheStrategy: { ttl: 300, swr: 60 },
    }),
  ])

  const totalCO2Saved = (decisions._sum.co2BaselineG ?? 0) - (decisions._sum.co2ChosenG ?? 0)
  const totalEmitted: number = emissions._sum.emissionCO2 ?? 0
  const totalOffset: number = emissions._sum.offsetCO2 ?? 0
  const offsetPct = totalEmitted > 0 ? (totalOffset / totalEmitted) * 100 : 0

  return {
    windowDays,
    totalDecisions: decisions._count.id,
    totalCO2SavedG: Math.max(0, totalCO2Saved),
    totalCO2EmittedG: totalEmitted,
    totalCO2OffsetG: totalOffset,
    offsetPercentage: Math.round(offsetPct * 10) / 10,
    credits: {
      active: (credits as any[]).find((c: any) => c.status === 'ACTIVE')?._sum.amountCO2 ?? 0,
      retired: (credits as any[]).find((c: any) => c.status === 'RETIRED')?._sum.amountCO2 ?? 0,
    },
  }
}

/**
 * Paginated audit trail — last N records for the investor view.
 * Cached 60s via Prisma Accelerate.
 */
export async function getAuditChain(organizationId: string, limit = 50, offset = 0) {
  const where = organizationId ? { organizationId } : {}
  return (prisma as any).governanceAuditLog.findMany({
    where,
    orderBy: { sequence: 'desc' },
    skip: offset,
    take: limit,
    cacheStrategy: { ttl: 60, swr: 30 },
  })
}

/**
 * Re-hash every audit record from genesis and verify the chain is intact.
 * Never cached — always runs fresh for the investor verification endpoint.
 */
export async function verifyChainIntegrity(): Promise<{
  intact: boolean
  brokenAt?: number
  checkedCount: number
}> {
  const records: Array<{
    sequence: number
    chainHash: string
    previousHash: string | null
    entityId: string
    action: string
    payload: unknown
    createdAt: Date
  }> = await (prisma as any).governanceAuditLog.findMany({
    orderBy: { sequence: 'asc' },
    select: {
      sequence: true,
      chainHash: true,
      previousHash: true,
      entityId: true,
      action: true,
      payload: true,
      createdAt: true,
    },
  })

  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    const prevHash = i === 0 ? 'GENESIS' : records[i - 1].chainHash

    const hashInput = [
      prevHash,
      String(r.sequence),
      r.entityId,
      r.action,
      JSON.stringify(r.payload),
      r.createdAt.toISOString(),
    ].join('|')

    const expected = createHash('sha256').update(hashInput).digest('hex')
    if (expected !== r.chainHash) {
      return { intact: false, brokenAt: r.sequence, checkedCount: i + 1 }
    }
  }

  return { intact: true, checkedCount: records.length }
}

/**
 * Compute a 0–100 governance compliance score for an org.
 */
export async function getComplianceScore(organizationId: string): Promise<number> {
  const [policy, auditCount, anomalyCount, recentDecisions] = await Promise.all([
    (prisma as any).organizationPolicy.findUnique({ where: { organizationId } }),
    (prisma as any).governanceAuditLog.count({ where: { organizationId } }),
    (prisma as any).governanceAuditLog.count({ where: { organizationId, action: 'ANOMALY_DETECTED' } }),
    (prisma as any).dashboardRoutingDecision.count({
      where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    }),
  ])

  let score = 50
  if (policy) score += 20
  if (policy?.tier === 'INVESTOR_GRADE') score += 10
  if (policy?.requireGreenRouting) score += 10
  if (auditCount > 0) score += 5
  if (recentDecisions > 0 && anomalyCount / Math.max(recentDecisions, 1) < 0.05) score += 5

  return Math.min(100, score)
}
