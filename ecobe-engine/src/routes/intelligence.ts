import { Router } from 'express'
import { z } from 'zod'

import { env } from '../config/env'
import { recordExternalWorkloadOutcome, IntelligenceOutcomeError } from '../lib/intelligence/outcome'
import { getIntelligenceMetrics } from '../lib/intelligence/metrics'
import { intelligenceJobGuard } from '../middleware/intelligence-job-guard'
import { runIntelligenceAccuracyJob, runVectorCleanupJob, runModelCalibrationJob } from '../workers/intelligence-jobs'
import { getJobStatuses, recordJobStatus } from '../lib/intelligence/job-status'
import { getIntegrationMetricsSummary } from '../lib/integration-metrics'
import { getScheduledIntelligenceJobs } from '../workers/intelligence-scheduler'

const router = Router()

const outcomeSchema = z.object({
  workloadId: z.string().min(1, 'workloadId is required'),
  region: z.string().min(1, 'region is required'),
  latency: z.number().nonnegative().optional(),
  carbonIntensity: z.number().nonnegative().optional(),
  cost: z.number().nonnegative().optional(),
  success: z.boolean(),
})

function intelligenceGuard(req: any, res: any, next: any) {
  if (!env.INTELLIGENCE_JOB_TOKEN) {
    return next()
  }

  const token = req.header('x-ecobe-intel-token') || req.header('x-ecobe-admin-token')
  if (token !== env.INTELLIGENCE_JOB_TOKEN) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid intelligence token',
      },
    })
  }

  return next()
}

router.post('/outcome', intelligenceGuard, async (req, res) => {
  try {
    const payload = outcomeSchema.parse(req.body)
    const carbonSaved = await recordExternalWorkloadOutcome(payload)
    return res.status(201).json({ success: true, carbonSaved })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Request validation failed',
          details: error.errors,
        },
      })
    }

    if (error instanceof IntelligenceOutcomeError) {
      const status = error.code === 'WORKLOAD_NOT_FOUND' ? 404 : 400
      return res.status(status).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      })
    }

    console.error('Intelligence outcome error:', error)
    return res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Internal server error',
      },
    })
  }
})

router.get('/metrics', intelligenceGuard, async (_req, res) => {
  try {
    const metrics = await getIntelligenceMetrics()
    return res.json({ success: true, metrics })
  } catch (error) {
    console.error('Intelligence metrics error:', error)
    return res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to fetch intelligence metrics',
      },
    })
  }
})

async function executeJob<T>(job: string, runner: () => Promise<T>) {
  const started = Date.now()
  try {
    const result = await runner()
    await recordJobStatus(job, {
      lastRunAt: new Date().toISOString(),
      success: true,
      durationMs: Date.now() - started,
      details: result as Record<string, unknown>,
      error: null,
    })
    return { ok: true, result }
  } catch (error: any) {
    await recordJobStatus(job, {
      lastRunAt: new Date().toISOString(),
      success: false,
      durationMs: Date.now() - started,
      details: undefined,
      error: error?.message ?? 'Unknown error',
    })
    throw error
  }
}

router.post('/jobs/accuracy', intelligenceJobGuard, async (_req, res) => {
  try {
    const { result } = await executeJob('intelligence-accuracy', runIntelligenceAccuracyJob)
    return res.json({ success: true, result })
  } catch (error: any) {
    console.error('Accuracy job error:', error)
    return res.status(500).json({ success: false, error: { code: 'JOB_FAILED', message: error?.message ?? 'Failed to run accuracy job' } })
  }
})

router.post('/jobs/vector-cleanup', intelligenceJobGuard, async (_req, res) => {
  try {
    const { result } = await executeJob('intelligence-vector-cleanup', runVectorCleanupJob)
    return res.json({ success: true, result })
  } catch (error: any) {
    console.error('Vector cleanup job error:', error)
    return res.status(500).json({ success: false, error: { code: 'JOB_FAILED', message: error?.message ?? 'Failed to run vector cleanup job' } })
  }
})

router.post('/jobs/model-calibration', intelligenceJobGuard, async (_req, res) => {
  try {
    const { result } = await executeJob('intelligence-model-calibration', runModelCalibrationJob)
    return res.json({ success: true, result })
  } catch (error: any) {
    console.error('Model calibration job error:', error)
    return res.status(500).json({ success: false, error: { code: 'JOB_FAILED', message: error?.message ?? 'Failed to run model calibration job' } })
  }
})

router.get('/jobs/status', intelligenceGuard, async (_req, res) => {
  try {
    const statuses = await getJobStatuses()
    return res.json({ success: true, jobs: statuses })
  } catch (error) {
    console.error('Job status error:', error)
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch job status' } })
  }
})

router.get('/jobs/metrics', intelligenceGuard, async (_req, res) => {
  try {
    const metrics = await getIntegrationMetricsSummary()
    return res.json({ success: true, metrics })
  } catch (error) {
    console.error('Job metrics error:', error)
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch job metrics' } })
  }
})

router.get('/jobs/schedules', intelligenceGuard, async (_req, res) => {
  try {
    const schedules = await getScheduledIntelligenceJobs()
    return res.json({ success: true, schedules })
  } catch (error) {
    console.error('Job schedules error:', error)
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch job schedules' } })
  }
})

export default router
