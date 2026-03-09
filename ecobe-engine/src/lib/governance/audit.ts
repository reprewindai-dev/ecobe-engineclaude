import { createHash } from 'crypto'
import { prisma } from '../db'
import { env } from '../../config/env'

export type AuditAction =
  | 'DECISION_CREATED'
  | 'CREDIT_PURCHASED'
  | 'CREDIT_RETIRED'
  | 'CREDIT_AUTO_OFFSET'
  | 'POLICY_UPDATED'
  | 'ANOMALY_DETECTED'
  | 'CHAIN_VERIFIED'
  | 'CARBON_SIGNAL_SELECTED'
  | 'ORG_KEY_ISSUED'
  | 'ORG_KEY_REVOKED'

interface AuditParams {
  organizationId?: string
  actorId?: string   // SHA256 of API key — raw key never stored
  actorType?: 'API_KEY' | 'SYSTEM' | 'CRON'
  action: AuditAction
  entityType: string
  entityId: string
  payload: Record<string, unknown>
  result: 'SUCCESS' | 'FAILURE' | 'BLOCKED'
  carbonSavedG?: number
  riskTier?: string
}

/**
 * Append an immutable, tamper-evident record to the governance audit log.
 *
 * Each record seals itself with a SHA256 hash of:
 *   previousChainHash | sequence | entityId | action | JSON(payload) | createdAt.toISOString()
 *
 * The $transaction ensures the sequence number and previousHash are read
 * atomically, so concurrent writes cannot corrupt the chain.
 */
export async function writeAuditLog(params: AuditParams): Promise<void> {
  if (!env.GOVERNANCE_AUDIT_ENABLED) return

  await (prisma as any).$transaction(async (tx: any) => {
    const last = await tx.governanceAuditLog.findFirst({
      orderBy: { sequence: 'desc' },
      select: { sequence: true, chainHash: true },
    })

    const sequence: number = (last?.sequence ?? 0) + 1
    const previousHash: string | null = last?.chainHash ?? null
    const now = new Date()

    const hashInput = [
      previousHash ?? 'GENESIS',
      String(sequence),
      params.entityId,
      params.action,
      JSON.stringify(params.payload),
      now.toISOString(),
    ].join('|')

    const chainHash = createHash('sha256').update(hashInput).digest('hex')

    await tx.governanceAuditLog.create({
      data: {
        sequence,
        organizationId: params.organizationId ?? null,
        actorId: params.actorId ?? null,
        actorType: params.actorType ?? 'SYSTEM',
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        payload: params.payload,
        result: params.result,
        chainHash,
        previousHash,
        carbonSavedG: params.carbonSavedG ?? null,
        riskTier: params.riskTier ?? null,
        createdAt: now,
      },
    })
  })
}
