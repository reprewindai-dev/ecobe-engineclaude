import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/db'
import { logger } from '../lib/logger'
import {
  getOrgCarbonSummary,
  getAuditChain,
  verifyChainIntegrity,
  getComplianceScore,
} from '../lib/governance/insights'
import { writeAuditLog } from '../lib/governance/audit'
import { generateOrgApiKey, hashApiKey } from '../middleware/auth'
import { sensitiveRateLimit } from '../app'

const router = Router()

const orgIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/, 'organizationId must contain only alphanumeric characters, hyphens, or underscores')

// GET /api/v1/governance/audit — paginated audit trail
router.get('/audit', async (req, res) => {
  try {
    const { organizationId, limit = '50', offset = '0' } = req.query as Record<string, string>
    const records = await getAuditChain(organizationId ?? '', parseInt(limit), parseInt(offset))
    res.json({ records, count: records.length })
  } catch (error) {
    console.error('Governance audit error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/v1/governance/audit/verify — cryptographic chain integrity proof (investor endpoint)
router.get('/audit/verify', async (_req, res) => {
  try {
    const result = await verifyChainIntegrity()
    // Write a CHAIN_VERIFIED audit record so the verification itself is on the ledger
    void writeAuditLog({
      actorType: 'SYSTEM',
      action: 'CHAIN_VERIFIED',
      entityType: 'GovernanceAuditLog',
      entityId: 'chain',
      payload: { checkedCount: result.checkedCount, intact: result.intact, brokenAt: result.brokenAt ?? null },
      result: result.intact ? 'SUCCESS' : 'FAILURE',
    })
    res.json({ ...result, verifiedAt: new Date().toISOString() })
  } catch (error) {
    console.error('Chain verify error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/v1/governance/insights — org carbon summary + compliance score
router.get('/insights', async (req, res) => {
  try {
    const { organizationId, windowDays = '30' } = req.query as Record<string, string>
    if (!organizationId) return res.status(400).json({ error: 'organizationId required' })

    const parsed = orgIdSchema.safeParse(organizationId)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid organizationId' })

    const [summary, complianceScore] = await Promise.all([
      getOrgCarbonSummary(organizationId, parseInt(windowDays)),
      getComplianceScore(organizationId),
    ])
    res.json({ ...summary, complianceScore })
  } catch (error) {
    console.error('Governance insights error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/v1/governance/policy — get current org policy
router.get('/policy', async (req, res) => {
  try {
    const { organizationId } = req.query as Record<string, string>
    if (!organizationId) return res.status(400).json({ error: 'organizationId required' })

    const parsed = orgIdSchema.safeParse(organizationId)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid organizationId' })

    const policy = await (prisma as any).organizationPolicy.findUnique({ where: { organizationId } })
    res.json(policy ?? { organizationId, tier: 'STANDARD', message: 'No policy configured — defaults apply' })
  } catch (error) {
    console.error('Get policy error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/v1/governance/policy — upsert org governance policy
router.post('/policy', async (req, res) => {
  try {
    const schema = z.object({
      organizationId: orgIdSchema,
      tier: z.enum(['BASIC', 'STANDARD', 'PREMIUM', 'INVESTOR_GRADE']).optional(),
      maxCarbonGPerKwh: z.number().int().positive().optional(),
      requireGreenRouting: z.boolean().optional(),
      autoOffsetEnabled: z.boolean().optional(),
      autoOffsetThresholdG: z.number().positive().optional(),
      anomalyDetectionEnabled: z.boolean().optional(),
      anomalyThresholdSigma: z.number().min(1).max(5).optional(),
    })

    const result = schema.safeParse(req.body)
    if (!result.success) return res.status(400).json({ error: result.error.flatten() })

    const { organizationId, ...data } = result.data
    const policy = await (prisma as any).organizationPolicy.upsert({
      where: { organizationId },
      create: { organizationId, ...data },
      update: { ...data, policyVersion: new Date().toISOString().slice(0, 10) },
    })

    void writeAuditLog({
      organizationId,
      actorType: 'API_KEY',
      action: 'POLICY_UPDATED',
      entityType: 'OrganizationPolicy',
      entityId: policy.id,
      payload: data as Record<string, unknown>,
      result: 'SUCCESS',
    })

    res.json(policy)
  } catch (error) {
    console.error('Set policy error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/v1/governance/snapshot/generate — generate a point-in-time investor snapshot
router.post('/snapshot/generate', async (req, res) => {
  try {
    const { organizationId } = req.body as { organizationId?: string }

    if (organizationId) {
      const parsed = orgIdSchema.safeParse(organizationId)
      if (!parsed.success) return res.status(400).json({ error: 'Invalid organizationId' })
    }

    const now = new Date()
    const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    const [summary, chainResult] = await Promise.all([
      organizationId ? getOrgCarbonSummary(organizationId, 1) : Promise.resolve(null),
      verifyChainIntegrity(),
    ])

    const complianceScore = organizationId ? await getComplianceScore(organizationId) : 0
    const countArgs = organizationId ? { where: { organizationId } } : {}
    const auditCount: number = await (prisma as any).governanceAuditLog.count(countArgs)

    const snapshot = await (prisma as any).governanceSnapshot.create({
      data: {
        organizationId: organizationId ?? null,
        snapshotType: 'DAILY_SUMMARY',
        windowStart,
        windowEnd: now,
        totalDecisions: summary?.totalDecisions ?? 0,
        totalCO2SavedG: summary?.totalCO2SavedG ?? 0,
        totalCO2EmittedG: summary?.totalCO2EmittedG ?? 0,
        totalCreditsActive: summary?.credits.active ?? 0,
        totalCreditsRetired: summary?.credits.retired ?? 0,
        offsetPercentage: summary?.offsetPercentage ?? 0,
        chainIntact: chainResult.intact,
        chainVerifiedAt: now,
        auditLogCount: auditCount,
        complianceScore: complianceScore / 100,
        payload: {
          chainCheckedCount: chainResult.checkedCount,
          brokenAt: chainResult.brokenAt ?? null,
        },
      },
    })

    res.json(snapshot)
  } catch (error) {
    logger.error({ err: error }, 'Snapshot generate error')
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Org API key management ────────────────────────────────────────────────────

// POST /api/v1/governance/keys — issue a new per-org API key
// Rate-limited to 10/min to prevent bulk issuance.
// Returns the plaintext key ONCE — it is never retrievable again.
router.post('/keys', sensitiveRateLimit, async (req, res) => {
  try {
    const body = z.object({
      organizationId: orgIdSchema,
      label: z.string().max(80).optional(),
    }).parse(req.body)

    const { plaintext, hash, prefix } = generateOrgApiKey()

    await (prisma as any).orgApiKey.create({
      data: {
        organizationId: body.organizationId,
        keyHash: hash,
        keyPrefix: prefix,
        label: body.label ?? null,
        active: true,
      },
    })

    void writeAuditLog({
      organizationId: body.organizationId,
      actorType: 'API_KEY',
      action: 'ORG_KEY_ISSUED',
      entityType: 'OrgApiKey',
      entityId: prefix,
      payload: { label: body.label ?? null },
      result: 'SUCCESS',
    })

    // Plaintext returned exactly once — store it immediately.
    res.status(201).json({
      organizationId: body.organizationId,
      keyPrefix: prefix,
      apiKey: plaintext,
      message: 'Store this key securely — it will not be shown again.',
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    logger.error({ err: error }, 'Key issuance error')
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/v1/governance/keys — list active keys for an org (prefixes only, no hashes)
router.get('/keys', async (req, res) => {
  try {
    const { organizationId } = req.query as Record<string, string>
    if (!organizationId) return res.status(400).json({ error: 'organizationId required' })

    const parsed = orgIdSchema.safeParse(organizationId)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid organizationId' })

    const keys = await (prisma as any).orgApiKey.findMany({
      where: { organizationId, active: true },
      select: { id: true, keyPrefix: true, label: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ organizationId, keys })
  } catch (error) {
    logger.error({ err: error }, 'Key list error')
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/v1/governance/keys/:id — revoke a key by ID
router.delete('/keys/:id', sensitiveRateLimit, async (req, res) => {
  try {
    const { organizationId } = req.query as Record<string, string>
    if (!organizationId) return res.status(400).json({ error: 'organizationId required' })

    const parsed = orgIdSchema.safeParse(organizationId)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid organizationId' })

    const key = await (prisma as any).orgApiKey.findFirst({
      where: { id: req.params.id, organizationId, active: true },
    })
    if (!key) return res.status(404).json({ error: 'Key not found' })

    await (prisma as any).orgApiKey.update({
      where: { id: req.params.id },
      data: { active: false, revokedAt: new Date() },
    })

    // Invalidate the Redis cache entry for this key
    try {
      const { redis } = await import('../lib/redis')
      await redis.del(`orgkey:${key.keyHash}`)
    } catch { /* Redis may be unavailable */ }

    void writeAuditLog({
      organizationId,
      actorType: 'API_KEY',
      action: 'ORG_KEY_REVOKED',
      entityType: 'OrgApiKey',
      entityId: key.keyPrefix,
      payload: { revokedKeyId: req.params.id },
      result: 'SUCCESS',
    })

    res.json({ success: true, revokedKeyId: req.params.id })
  } catch (error) {
    logger.error({ err: error }, 'Key revocation error')
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
