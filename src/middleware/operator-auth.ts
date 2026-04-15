import type { Request, Response, NextFunction } from 'express'
import { resolveOperatorFromKey } from '../lib/doctrine/doctrine-service'

export type OperatorRole = 'viewer' | 'operator' | 'admin'

declare global {
  namespace Express {
    interface Request {
      operator?: {
        id: string
        orgId: string
        displayName: string
        role: OperatorRole
      }
    }
  }
}

/**
 * Resolves the calling operator from the x-ecobe-operator-key header.
 * Attaches operator context to req.operator.
 * Returns 401 if the key is missing or unknown, 403 if the account is inactive.
 */
export async function operatorAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const rawKey = req.header('x-ecobe-operator-key')
  if (!rawKey) {
    return res.status(401).json({
      success: false,
      error: { code: 'OPERATOR_KEY_MISSING', message: 'x-ecobe-operator-key header is required' },
    })
  }

  const operator = await resolveOperatorFromKey(rawKey)
  if (!operator) {
    return res.status(401).json({
      success: false,
      error: { code: 'OPERATOR_KEY_INVALID', message: 'Operator key not recognized' },
    })
  }
  if (!operator.active) {
    return res.status(403).json({
      success: false,
      error: { code: 'OPERATOR_INACTIVE', message: 'Operator account is inactive' },
    })
  }

  req.operator = {
    id: operator.id,
    orgId: operator.orgId,
    displayName: operator.displayName,
    role: operator.role as OperatorRole,
  }

  return next()
}

/**
 * Requires a minimum role level. Must be used after operatorAuthMiddleware.
 */
export function requireRole(minimum: OperatorRole) {
  const hierarchy: OperatorRole[] = ['viewer', 'operator', 'admin']
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.operator) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Operator not authenticated' },
      })
    }
    const callerLevel = hierarchy.indexOf(req.operator.role)
    const requiredLevel = hierarchy.indexOf(minimum)
    if (callerLevel < requiredLevel) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_ROLE',
          message: `This action requires role '${minimum}' or higher. Caller has role '${req.operator.role}'.`,
        },
      })
    }
    return next()
  }
}
