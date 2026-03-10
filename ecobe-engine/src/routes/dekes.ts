import { Router } from 'express'
import { z } from 'zod'
import { routeGreen } from '../lib/green-routing'
import { prisma } from '../lib/db'

const router = Router()

// Shared secret between DEKES SaaS and ECOBE
const DEKES_API_KEY = process.env.DEKES_API_KEY

function requireApiKey(req: any, res: any, next: any) {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const token = auth.slice(7)
  if (token !== DEKES_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

const optimizeRequestSchema = z.object({
  query: z.object({
    id: z.string(),
    query: z.string(),
    estimatedResults: z.number(),
  }),
  carbonBudget: z.number(),
  regions: z.array(z.string()).min(1),
})

router.post('/optimize', requireApiKey, async (req, res) => {
  try {
    const data = optimizeRequestSchema.parse(req.body)

    // Map DEKES request to green routing request
    const routingResult = await routeGreen({
      preferredRegions: data.regions,
      maxCarbonGPerKwh: data.carbonBudget,
      carbonWeight: 0.5,
      latencyWeight: 0.2,
      costWeight: 0.3,
    })

    // Return DEKES-compatible response
    const response = {
      selectedRegion: routingResult.selectedRegion,
      estimatedCO2: routingResult.carbonIntensity * 0.05, // rough estimate
      scheduledTime: new Date().toISOString(),
      score: routingResult.score,
      alternatives: routingResult.alternatives.map((alt) => ({
        region: alt.region,
        estimatedCO2: alt.carbonIntensity * 0.05,
        score: alt.score,
      })),
    }

    res.json(response)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    console.error('DEKES optimize error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

const reportRequestSchema = z.object({
  queryId: z.string(),
  actualCO2: z.number(),
  timestamp: z.string().optional(),
})

router.post('/report', requireApiKey, async (req, res) => {
  try {
    const data = reportRequestSchema.parse(req.body)

    const reportedAt = data.timestamp ? new Date(data.timestamp) : new Date()

    // Store carbon usage report using DekesWorkload model
    await prisma.dekesWorkload.create({
      data: {
        dekesQueryId: data.queryId,
        actualCO2: data.actualCO2,
        scheduledTime: Number.isNaN(reportedAt.getTime()) ? new Date() : reportedAt,
        status: 'REPORTED',
        estimatedQueries: 1, // Default values for report-only entries
        estimatedResults: 1,
      },
    }).catch(() => {}) // Ignore duplicates

    res.json({ received: true, queryId: data.queryId })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    console.error('DEKES report error:', error)
    res.status(500).json({ error: 'Failed to process report' })
  }
})

export default router
