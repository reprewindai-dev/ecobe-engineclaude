import { createHash, randomBytes } from 'crypto'
import { Request, Response, NextFunction } from 'express'
import { env } from '../config/env'
import { prisma } from '../lib/db'
import { logger } from '../lib/logger'

// ── Key hashing ───────────────────────────────────────────────────────────────

export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex')
}

/**
 * Generate a new org API key.
 * Returns { plaintext, hash, prefix } — plaintext is shown once and never stored.
 */
export function generateOrgApiKey(): { plaintext: string; hash: string; prefix: string } {
  const raw = randomBytes(32).toString('hex')
  const plaintext = `co2r_${raw}`
  return { plaintext, hash: hashApiKey(plaintext), prefix: plaintext.slice(0, 12) }
}

// ── Redis-backed per-org key cache ────────────────────────────────────────────
// Falls back to DB on miss. Cache TTL: 5 minutes.

async function lookupOrgKeyHash(keyHash: string): Promise<string | null> {
  try {
    const { redis } = await import('../lib/redis')
    const cacheKey = `orgkey:${keyHash}`
    const cached = await redis.get(cacheKey)
    if (cached !== null) return cached // cached orgId or 'INVALID'

    const record = await (prisma as any).orgApiKey.findFirst({
      where: { keyHash, active: true },
      select: { organizationId: true },
    })
    const orgId = record?.organizationId ?? null
    // Cache result for 5 min; negative results cached as 'INVALID' to prevent DB hammering
    await redis.setex(cacheKey, 300, orgId ?? 'INVALID')
    return orgId
  } catch {
    // If Redis is down, fall back to direct DB lookup
    const record = await (prisma as any).orgApiKey.findFirst({
      where: { keyHash, active: true },
      select: { organizationId: true },
    })
    return record?.organizationId ?? null
  }
}

// ── Main auth middleware ───────────────────────────────────────────────────────

/**
 * Two-layer authentication:
 *
 *   1. Master key (CO2ROUTER_API_KEY) — admin / system access; no org binding.
 *   2. Org key (OrgApiKey table) — scoped to a single organization.
 *      When matched, sets req.resolvedOrgId so downstream handlers
 *      don't need the X-Organization-Id header.
 *
 * Fail-closed: missing or invalid key → 401.
 */
export async function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const masterKey = env.CO2ROUTER_API_KEY

  if (!masterKey) {
    if (env.NODE_ENV === 'development' && env.ALLOW_INSECURE_NO_API_KEY) {
      return next()
    }
    return res.status(401).json({ error: 'Unauthorized: API key not configured' })
  }

  const header = req.headers['authorization'] ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Fast path: master key matches
  if (token === masterKey) {
    return next()
  }

  // Org key path: hash the token and look it up
  const tokenHash = hashApiKey(token)
  const orgId = await lookupOrgKeyHash(tokenHash).catch((err) => {
    logger.error({ err }, 'Org key lookup failed')
    return null
  })

  if (!orgId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Bind the org to the request so downstream handlers can read it without
  // requiring the caller to also send X-Organization-Id.
  ;(req as any).resolvedOrgId = orgId
  return next()
}
