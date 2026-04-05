import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/db'
import { env } from '../config/env'
import { createDecision, persistCiDecisionResult } from './ci'
import {
  buildDekesDecisionSurface,
  estimateDekesEnergyKwh,
} from '../lib/dekes/canonical'

const router = Router()

// Shared secret between DEKES SaaS and ECOBE
const DEKES_API_KEY =
  env.DEKES_API_KEY || process.env.ECOBE_API_KEY || process.env.ECOBE_ENGINE_API_KEY

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

const scheduleRequestSchema = z.object({
  queries: z
    .array(
      z.object({
        id: z.string(),
        query: z.string().optional(),
        estimatedResults: z.number().optional(),
        estimatedKwh: z.number().optional(),
      })
    )
    .min(1),
  carbonBudget: z.number().optional(),
  preferredRegions: z.array(z.string()).min(1).optional(),
  regions: z.array(z.string()).min(1).optional(),
})

router.post('/optimize', requireApiKey, async (req, res) => {
  try {
    const data = optimizeRequestSchema.parse(req.body)
    const estimatedKwh = estimateDekesEnergyKwh({
      estimatedResults: data.query.estimatedResults,
    })
    const started = Date.now()
    const decision = await createDecision({
      preferredRegions: data.regions,
      carbonWeight: 0.5,
      waterWeight: 0.2,
      latencyWeight: 0.2,
      costWeight: 0.1,
      workloadClass: 'interactive',
      jobType: 'light',
      criticality: 'standard',
      allowDelay: true,
      decisionMode: 'scenario_planning',
      estimatedEnergyKwh: estimatedKwh,
      metadata: {
        source: 'dekes_optimize',
        queryId: data.query.id,
        query: data.query.query,
        estimatedResults: data.query.estimatedResults,
        carbonBudget: data.carbonBudget,
      },
    })
    const totalMs = Date.now() - started
    const canonicalResponse = await persistCiDecisionResult(decision, {
      total: totalMs,
      compute: totalMs,
    })

    const response = {
      estimatedCO2: Number((canonicalResponse.selected.carbonIntensity * estimatedKwh).toFixed(6)),
      scheduledTime: new Date().toISOString(),
      score:
        typeof canonicalResponse.candidateEvaluations?.[0]?.score === 'number'
          ? canonicalResponse.candidateEvaluations[0].score
          : 0,
      alternatives: (canonicalResponse.candidateEvaluations ?? []).slice(0, 3).map((candidate) => ({
        region: candidate.region,
        estimatedCO2: Number((candidate.carbonIntensity * estimatedKwh).toFixed(6)),
        score: candidate.score,
      })),
      budgetStatus:
        canonicalResponse.selected.carbonIntensity > data.carbonBudget ? 'exceeded' : 'within_budget',
      ...buildDekesDecisionSurface(canonicalResponse),
    }

    await prisma.integrationEvent
      .create({
        data: {
          source: 'DEKES_INTEGRATION',
          eventType: 'OPTIMIZE_DECISION',
          message: JSON.stringify({
            decisionFrameId: response.decisionFrameId,
            queryId: data.query.id,
            selectedRegion: response.selectedRegion,
            action: response.action,
            proofHash: response.proofHash,
          }),
          success: true,
        },
      })
      .catch(() => {})

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


/**
 * GET /api/v1/dekes/analytics
 * Returns aggregated DEKES analytics
 */
router.get('/analytics', requireApiKey, async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 7
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const workloads = await prisma.dekesWorkload.findMany({
      where: { scheduledTime: { gte: since } },
      orderBy: { scheduledTime: 'desc' },
    })

    // Aggregate stats
    const totalWorkloads = workloads.length
    const totalCO2 = workloads.reduce((sum: number, w: any) => sum + (w.actualCO2 ?? 0), 0)
    const totalQueries = workloads.reduce((sum: number, w: any) => sum + (w.estimatedQueries ?? 0), 0)
    const totalResults = workloads.reduce((sum: number, w: any) => sum + (w.estimatedResults ?? 0), 0)

    // Group by status
    const statusMap = new Map<string, number>()
    for (const w of workloads) {
      const status = w.status || 'UNKNOWN'
      statusMap.set(status, (statusMap.get(status) ?? 0) + 1)
    }

    // Calculate CO2 by day
    const dailyMap = new Map<string, number>()
    for (const w of workloads) {
      const day = w.scheduledTime.toISOString().split('T')[0]
      dailyMap.set(day, (dailyMap.get(day) ?? 0) + (w.actualCO2 ?? 0))
    }

    const dailyTrend = Array.from(dailyMap.entries())
      .map(([date, co2]: [string, number]) => ({ date, co2: Math.round(co2 * 1000) / 1000 }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return res.json({
      timeRange: `${days}d`,
      totalWorkloads,
      totalCO2: Math.round(totalCO2 * 1000) / 1000,
      totalQueries,
      totalResults,
      avgCO2PerQuery: totalQueries > 0 ? Math.round((totalCO2 / totalQueries) * 1000) / 1000 : 0,
      statusBreakdown: Object.fromEntries(statusMap),
      dailyTrend,
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    console.error('DEKES analytics error:', error)
    res.status(500).json({ error: 'Failed to compute analytics' })
  }
})

/**
 * POST /api/v1/dekes/schedule
 * Schedules an array of DEKES queries for optimal carbon execution
 */
router.post('/schedule', requireApiKey, async (req, res) => {
  try {
    const data = scheduleRequestSchema.parse(req.body)
    const preferredRegions =
      data.preferredRegions ?? data.regions ?? ['us-east-1', 'us-west-2', 'eu-west-1']

    const scheduledQueries = await Promise.all(
      data.queries.map(async (query) => {
        try {
          const estimatedKwh = estimateDekesEnergyKwh({
            estimatedResults: query.estimatedResults,
            estimatedKwh: query.estimatedKwh,
          })
          const started = Date.now()
          const decision = await createDecision({
            preferredRegions,
            carbonWeight: 0.6,
            waterWeight: 0.2,
            latencyWeight: 0.1,
            costWeight: 0.1,
            workloadClass: 'batch',
            jobType: 'light',
            criticality: 'batch',
            allowDelay: true,
            decisionMode: 'scenario_planning',
            estimatedEnergyKwh: estimatedKwh,
            metadata: {
              source: 'dekes_schedule',
              queryId: query.id,
              query: query.query ?? null,
              estimatedResults: query.estimatedResults ?? null,
              carbonBudget: data.carbonBudget ?? null,
            },
          })
          const response = await persistCiDecisionResult(decision, {
            total: Date.now() - started,
            compute: Date.now() - started,
          })

          return {
            queryId: query.id,
            estimatedCO2: Number((response.selected.carbonIntensity * estimatedKwh).toFixed(6)),
            score:
              typeof response.candidateEvaluations?.[0]?.score === 'number'
                ? response.candidateEvaluations[0].score
                : 0,
            recommendations: (response.candidateEvaluations ?? []).slice(0, 2).map((candidate) => ({
              region: candidate.region,
              estimatedCO2: Number((candidate.carbonIntensity * estimatedKwh).toFixed(6)),
            })),
            budgetStatus:
              data.carbonBudget != null && response.selected.carbonIntensity > data.carbonBudget
                ? 'exceeded'
                : 'within_budget',
            ...buildDekesDecisionSurface(response),
          }
        } catch (error) {
          return { queryId: query.id, error: 'Routing failed' }
        }
      })
    )

    await prisma.integrationEvent
      .create({
        data: {
          source: 'DEKES_INTEGRATION',
          eventType: 'SCHEDULE_DECISION_BATCH',
          message: JSON.stringify({
            totalQueries: data.queries.length,
            scheduled: scheduledQueries.filter((query) => !('error' in query)).length,
            failed: scheduledQueries.filter((query) => 'error' in query).length,
          }),
          success: true,
        },
      })
      .catch(() => {})

    return res.json({
      totalQueries: data.queries.length,
      scheduled: scheduledQueries.filter((query) => !('error' in query)).length,
      failed: scheduledQueries.filter((query) => 'error' in query).length,
      queries: scheduledQueries,
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    console.error('DEKES schedule error:', error)
    res.status(500).json({ error: 'Failed to schedule queries' })
  }
})

export default router
