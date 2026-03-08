import { Request, Response, NextFunction } from 'express'

/**
 * Validates and attaches the X-Organization-Id header to the request context.
 * Rejects requests where the header is present but malformed.
 * If absent, passes through — org-scoped endpoints validate presence themselves.
 */
export function attachOrgContext(req: Request, res: Response, next: NextFunction) {
  const orgId = req.headers['x-organization-id']
  if (orgId !== undefined) {
    if (typeof orgId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(orgId)) {
      return res.status(400).json({ error: 'Invalid X-Organization-Id header format' })
    }
  }
  next()
}
