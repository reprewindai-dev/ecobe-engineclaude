import { Router } from 'express'
import { routeWorkload, createRouteResponse } from '../../src/services/router.service'

const router = Router()

/**
 * POST /api/v1/route
 * Core routing decision endpoint
 */
router.post('/', async (req, res) => {
  try {
    const { workloadId, candidateRegions, durationMinutes, workloadType } = req.body

    // Basic validation
    if (!workloadId || !candidateRegions || !Array.isArray(candidateRegions) || candidateRegions.length === 0) {
      return res.status(400).json({ error: 'Invalid request: workloadId and candidateRegions required' })
    }

    const decision = await routeWorkload({
      workloadId,
      candidateRegions,
      durationMinutes: durationMinutes || 240,
      workloadType: workloadType || 'batch',
    })

    const response = await createRouteResponse(decision)

    res.status(201).json(response)
  } catch (error: any) {
    console.error('Route error:', error)
    res.status(500).json({ error: 'Internal server error', message: error.message })
  }
})

export default router
