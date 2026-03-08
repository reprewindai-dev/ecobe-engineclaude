import { Request, Response, NextFunction } from 'express'
import { env } from '../config/env'

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = env.ECOBE_ENGINE_API_KEY

  if (!apiKey) {
    // Fail closed by default — a production deploy missing the key must not silently open.
    // Only allow bypass in development with an explicit opt-in flag.
    if (env.NODE_ENV === 'development' && env.ALLOW_INSECURE_NO_API_KEY) {
      return next()
    }
    return res.status(401).json({ error: 'Unauthorized: API key not configured' })
  }

  const header = req.headers['authorization'] ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''

  if (token !== apiKey) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}
