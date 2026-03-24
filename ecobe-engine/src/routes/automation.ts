import { Response, Router } from 'express'
import { z } from 'zod'

import { getCacheHealthStatus, warmCacheOnStartup } from '../lib/cache-warmer'
import { prisma } from '../lib/db'
import { redis } from '../lib/redis'
import { TaskAlreadyRunningError, withTaskLock } from '../lib/task-lock'
import { internalServiceGuard } from '../middleware/internal-auth'
import { getWorkerStatus } from './system'
import { runForecastRefresh } from '../workers/forecast-poller'
import { runForecastVerification } from '../workers/forecast-verification'
import { runEIAIngestionOnce } from '../workers/eia-ingestion'

const router = Router()

router.use(internalServiceGuard)

const warmCacheRequestSchema = z
  .object({
    regions: z.array(z.string().min(1)).min(1).optional(),
  })
  .optional()

const verificationRequestSchema = z
  .object({
    lookbackHours: z.number().int().min(1).max(168).default(6),
  })
  .optional()

function alreadyRunningResponse(res: Response, task: string, runId: string | null) {
  return res.status(202).json({
    ok: true,
    task,
    status: 'already_running',
    runId,
  })
}

router.post('/ingest/eia', async (_req, res) => {
  try {
    const result = await runEIAIngestionOnce()
    return res.json({
      ok: true,
      task: 'eia_ingestion',
      ...result,
    })
  } catch (error) {
    if (error instanceof TaskAlreadyRunningError) {
      return alreadyRunningResponse(res, 'eia_ingestion', error.runId)
    }

    return res.status(500).json({
      ok: false,
      task: 'eia_ingestion',
      error: error instanceof Error ? error.message : 'Unknown EIA ingestion error',
    })
  }
})

router.post('/forecast/refresh', async (_req, res) => {
  try {
    const result = await runForecastRefresh()
    return res.json({
      ok: true,
      task: 'forecast_refresh',
      ...result,
    })
  } catch (error) {
    if (error instanceof TaskAlreadyRunningError) {
      return alreadyRunningResponse(res, 'forecast_refresh', error.runId)
    }

    return res.status(500).json({
      ok: false,
      task: 'forecast_refresh',
      error: error instanceof Error ? error.message : 'Unknown forecast refresh error',
    })
  }
})

router.post('/cache/warm', async (req, res) => {
  try {
    const body = warmCacheRequestSchema.parse(req.body)
    const { result, runId } = await withTaskLock('cache_warm', 10 * 60, async () =>
      warmCacheOnStartup(body?.regions)
    )
    return res.json({
      ok: true,
      task: 'cache_warm',
      runId,
      ...result,
    })
  } catch (error) {
    if (error instanceof TaskAlreadyRunningError) {
      return alreadyRunningResponse(res, 'cache_warm', error.runId)
    }

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        task: 'cache_warm',
        error: 'Invalid cache warm request',
        details: error.errors,
      })
    }

    return res.status(500).json({
      ok: false,
      task: 'cache_warm',
      error: error instanceof Error ? error.message : 'Unknown cache warm error',
    })
  }
})

router.post('/verification/run', async (req, res) => {
  try {
    const body = verificationRequestSchema.parse(req.body)
    const result = await runForecastVerification(body?.lookbackHours ?? 6)
    return res.json({
      ok: true,
      task: 'forecast_verification',
      ...result,
    })
  } catch (error) {
    if (error instanceof TaskAlreadyRunningError) {
      return alreadyRunningResponse(res, 'forecast_verification', error.runId)
    }

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        task: 'forecast_verification',
        error: 'Invalid forecast verification request',
        details: error.errors,
      })
    }

    return res.status(500).json({
      ok: false,
      task: 'forecast_verification',
      error: error instanceof Error ? error.message : 'Unknown verification error',
    })
  }
})

router.get('/automation/health', async (_req, res) => {
  try {
    const [dbOk, redisOk, cacheHealth] = await Promise.all([
      prisma.$queryRaw`SELECT 1`
        .then(() => true)
        .catch(() => false),
      redis
        .ping()
        .then(() => true)
        .catch(() => false),
      getCacheHealthStatus(),
    ])

    const workers = getWorkerStatus()
    const healthy = dbOk && redisOk && cacheHealth.redisConnected && cacheHealth.isHealthy

    return res.status(healthy ? 200 : 503).json({
      status: healthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbOk,
        redis: redisOk,
        cache: cacheHealth.isHealthy,
      },
      workers,
      cache: cacheHealth,
    })
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown automation health error',
    })
  }
})

export default router
