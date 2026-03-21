import { Router } from 'express'
import { routeWorkload } from '../services/router.service'

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

    res.status(201).json({
      decisionId: decision.decision_id,
      chosenRegion: decision.chosen_region,
      gridZone: 'TEMP', // Will be replaced by real mapping later
      source: decision.winner_source,
      signalType: 'average',
      carbonValue: decision.winner_value,
      confidence: 0.3, // Temporary static value
      freshness: new Date().toISOString(),
      degraded: decision.degraded,
      alternatives: candidateRegions.map(region => ({
        region,
        carbonValue: decision.winner_value + Math.random() * 50, // Temp variation
        source: decision.winner_source,
        degraded: decision.degraded,
      })),
      carbonDeltaVsWorst: decision.carbon_delta,
    })
  } catch (error: any) {
    console.error('Route error:', error)
    res.status(500).json({ error: 'Internal server error', message: error.message })
  }
})

export default router
