import { Router } from 'express'
import { buildPublicHealthSnapshot } from '../lib/runtime/public-health'

const router = Router()

/**
 * GET /api/v1/health
 * Health check endpoint for dashboard
 */
router.get('/', async (_req, res) => {
  try {
    const snapshot = await buildPublicHealthSnapshot()
    res.status(snapshot.statusCode).json(snapshot.body)
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

export default router
