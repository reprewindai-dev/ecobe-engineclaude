import { Router } from 'express'
import { z } from 'zod'
import {
  optimizeQuery,
  scheduleBatchQueries,
  getDekesAnalytics,
  reportWorkloadComplete,
} from '../lib/dekes-integration'

const router = Router()

// ─── Schema ──────────────────────────────────────────────────────────────────

const dekesQuerySchema = z.object({
  id: z.string(),
  query: z.string(),
  estimatedResults: z.number().int().positive(),
})

const optimizeBodySchema = z.object({
  query: dekesQuerySchema,
  carbonBudget: z.number().positive().optional(),
  regions: z.array(z.string()).min(1),
})

const scheduleBodySchema = z.object({
  queries: z.array(dekesQuerySchema).min(1),
  regions: z.array(z.string()).min(1),
  lookAheadHours: z.number().int().min(1).max(168).default(24),
})

const reportBodySchema = z.object({
  queryId: z.string(),
  actualCO2: z.number().nonnegative(),
})

// ─── Endpoints ───────────────────────────────────────────────────────────────

/**
 * GET /api/v1/dekes/health
 * Lightweight liveness check for the DEKES integration layer.
 */
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'DEKES Integration', timestamp: new Date().toISOString() })
})

/**
 * GET /api/v1/dekes/analytics
 * Aggregate metrics: total workloads, CO2 saved, recent history.
 */
router.get('/analytics', async (_req, res) => {
  try {
    const analytics = await getDekesAnalytics()
    res.json(analytics)
  } catch (error) {
    console.error('DEKES analytics error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/v1/dekes/optimize
 * Optimize a single DEKES query — returns best region + carbon estimate.
 *
 * Body:
 *   query         { id, query, estimatedResults }
 *   carbonBudget  optional max gCO2/kWh
 *   regions       array of region codes
 */
router.post('/optimize', async (req, res) => {
  try {
    const body = optimizeBodySchema.parse(req.body)
    const result = await optimizeQuery(body.query, body.carbonBudget, body.regions)
    res.json(result)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    console.error('DEKES optimize error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/v1/dekes/schedule
 * Schedule a batch of queries for the greenest time window.
 *
 * Body:
 *   queries        [{ id, query, estimatedResults }]
 *   regions        array of region codes
 *   lookAheadHours hours to look ahead for optimal window (default 24)
 */
router.post('/schedule', async (req, res) => {
  try {
    const body = scheduleBodySchema.parse(req.body)
    const schedule = await scheduleBatchQueries(body.queries, body.regions, body.lookAheadHours)
    res.json({ schedule, totalQueries: schedule.length })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    console.error('DEKES schedule error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/v1/dekes/report
 * Record actual CO2 for a completed workload (closes the feedback loop).
 *
 * Body:
 *   queryId    DEKES query id
 *   actualCO2  actual gCO2eq emitted
 */
router.post('/report', async (req, res) => {
  try {
    const body = reportBodySchema.parse(req.body)
    const result = await reportWorkloadComplete(body.queryId, body.actualCO2)
    if (!result.updated) {
      return res.status(404).json({ error: 'Workload not found or already completed' })
    }
    res.json({ ok: true, queryId: body.queryId })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    console.error('DEKES report error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
