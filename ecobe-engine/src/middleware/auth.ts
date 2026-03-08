import { Request, Response, NextFunction } from 'express'
import { env } from '../config/env'

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = env.ECOBE_ENGINE_API_KEY
  if (!apiKey) return next() // not configured → allow (dev mode)

  const header = req.headers['authorization'] ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''

  if (token !== apiKey) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}
