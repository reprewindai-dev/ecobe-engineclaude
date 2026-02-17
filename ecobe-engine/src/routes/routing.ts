import { Router } from 'express'
import { z } from 'zod'
import { routeGreen } from '../lib/green-routing'

const router = Router()

const routingRequestSchema = z.object({
  preferredRegions: z.array(z.string()).min(1),
  maxCarbonGPerKwh: z.number().positive().optional(),
  latencyMsByRegion: z.record(z.number()).optional(),
  carbonWeight: z.number().min(0).max(1).optional(),
  latencyWeight: z.number().min(0).max(1).optional(),
  costWeight: z.number().min(0).max(1).optional(),
})

router.post('/green', async (req, res) => {
  try {
    const data = routingRequestSchema.parse(req.body)

    const result = await routeGreen(data)

    res.json(result)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    console.error('Green routing error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
