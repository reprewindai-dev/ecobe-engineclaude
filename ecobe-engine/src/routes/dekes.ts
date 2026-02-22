import { Router } from 'express'
import { z } from 'zod'
import { dekesIntegration } from '../lib/dekes-integration'
import { env } from '../config/env'

const router = Router()

const dekesQuerySchema = z.object({
  id: z.string(),
  query: z.string(),
  estimatedResults: z.number().positive(),
})

// DEKES integration health (validate-only)
router.get('/health', async (req, res) => {
  const configured = Boolean(env.DEKES_API_URL)
  const ping = req.query.ping === 'true'

  if (!configured || !ping) {
    return res.json({
      configured,
      hasUrl: Boolean(env.DEKES_API_URL),
      hasKey: false, // ECOBE Engine doesn't need DEKES API key
    })
  }

  const ok = await dekesIntegration.ping().catch(() => false)

  return res.json({
    configured,
    hasUrl: true,
    hasKey: false, // ECOBE Engine doesn't need DEKES API key
    ping: {
      ok,
    },
  })
})

const optimizeQuerySchema = z.object({
  query: dekesQuerySchema,
  carbonBudget: z.number().positive(),
  regions: z.array(z.string()).min(1),
})

const scheduleBatchSchema = z.object({
  queries: z.array(dekesQuerySchema),
  regions: z.array(z.string()).min(1),
  lookAheadHours: z.number().positive().optional().default(24),
})

const reportCarbonSchema = z.object({
  queryId: z.string(),
  actualCO2: z.number(),
})

// Optimize single DEKES query for carbon
router.post('/optimize', async (req, res) => {
  try {
    const data = optimizeQuerySchema.parse(req.body)

    const result = await dekesIntegration.optimizeQuery(
      data.query,
      data.carbonBudget,
      data.regions
    )

    res.json(result)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    console.error('DEKES optimize error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Schedule batch DEKES queries for optimal carbon windows
router.post('/schedule', async (req, res) => {
  try {
    const data = scheduleBatchSchema.parse(req.body)

    const result = await dekesIntegration.scheduleBatchQueries(
      data.queries,
      data.regions,
      data.lookAheadHours
    )

    res.json(result)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    console.error('DEKES schedule error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Report actual carbon usage for a DEKES query
router.post('/report', async (req, res) => {
  try {
    const data = reportCarbonSchema.parse(req.body)

    await dekesIntegration.reportCarbonUsage(data.queryId, data.actualCO2)

    res.json({ success: true, message: 'Carbon usage reported' })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    console.error('DEKES report error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get DEKES workload history and analytics
router.get('/analytics', async (req, res) => {
  try {
    const { dekesQueryId, startDate, endDate } = req.query

    const analytics = await dekesIntegration.getWorkloadAnalytics(
      dekesQueryId as string | undefined,
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined
    )

    res.json(analytics)
  } catch (error: any) {
    console.error('DEKES analytics error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
