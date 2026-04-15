/**
 * Operator authentication + RBAC middleware.
 * Reads x-ecobe-operator-key header, resolves OperatorIdentity from DB,
 * attaches to req.operator. Enforces minimum role requirement.
 *
 * Roles: viewer < operator < admin
 */
import { createHash } from 'crypto'
import type { NextFunction, Request, Response } from 'express'
import { prisma } from '../lib/db'

export type OperatorRole = 'viewer' | 'operator' | 'admin'

declare global {
  namespace Express {
    interface Request {
      operator?: {
        id: string
        orgId: string
        email: string
        role: OperatorRole
      }
    }
  }
}

const ROLE_RANK: Record<OperatorRole, number> = {
  viewer: 0,
  operator: 1,
  admin: 2,
}

function extractOperatorKey(req: Request): string | null {
  const header = req.header('x-ecobe-operator-key')?.trim()
  if (header) return header
  const auth = req.header('authorization')
  if (auth?.startsWith('Operator ')) return auth.slice('Operator '.length).trim()
  return null
}

function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex')
}

export function operatorGuard(minRole: OperatorRole = 'operator') {
  return async (req: Request, res: Response, next: NextFunction) => {
    const rawKey = extractOperatorKey(req)
    if (!rawKey) {
      return res.status(401).json({
        error: 'Operator key required',
        code: 'OPERATOR_KEY_MISSING',
      })
    }

    const keyHash = hashKey(rawKey)
    const identity = await prisma.operatorIdentity.findUnique({
      where: { keyHash },
      select: { id: true, orgId: true, email: true, role: true, active: true },
    }).catch(() => null)

    if (!identity || !identity.active) {
      return res.status(401).json({
        error: 'Invalid or inactive operator key',
        code: 'OPERATOR_KEY_INVALID',
      })
    }

    const operatorRole = identity.role as OperatorRole
    if (ROLE_RANK[operatorRole] < ROLE_RANK[minRole]) {
      return res.status(403).json({
        error: `Role '${operatorRole}' insufficient — requires '${minRole}'`,
        code: 'OPERATOR_ROLE_INSUFFICIENT',
      })
    }

    // Update lastSeenAt async — non-blocking
    prisma.operatorIdentity.update({
      where: { id: identity.id },
      data: { lastSeenAt: new Date() },
    }).catch(() => {})

    req.operator = {
      id: identity.id,
      orgId: identity.orgId,
      email: identity.email,
      role: operatorRole,
    }

    return next()
  }
}
