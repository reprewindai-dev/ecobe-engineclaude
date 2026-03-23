import { Router } from 'express'
import { routeGreen } from '../lib/green-routing'

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

    const decision = await routeGreen({
      preferredRegions: candidateRegions,
      maxCarbonGPerKwh: 500,
      latencyMsByRegion: {},
      costWeight: 0.3,
      carbonWeight: 0.5,
      latencyWeight: 0.2,
    })

    res.status(201).json({
      success: true,
      decision: {
        selectedRegion: decision.selectedRegion,
        carbonIntensity: decision.carbonIntensity,
        estimatedLatency: decision.estimatedLatency,
        score: decision.score,
        qualityTier: decision.qualityTier,
        carbonDelta: decision.carbon_delta_g_per_kwh,
        forecastStability: decision.forecast_stability
      }
    })
  } catch (error: any) {
    console.error('Route error:', error)
    res.status(500).json({ error: 'Internal server error', message: error.message })
  }
})

export default router
