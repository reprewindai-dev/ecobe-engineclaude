import { Router, Request, Response } from 'express'
import { getCacheHealthStatus } from '../lib/cache-warmer'
import { redis } from '../lib/redis'
import { prisma } from '../lib/db'
import { GridSignalCache } from '../lib/grid-signals/grid-signal-cache'
import {
  createInitialWorkerRegistry,
  getRuntimeIncidentSummary,
  loadPersistedWorkerStatuses,
  mergeWorkerRegistries,
  persistWorkerStatus,
  type WorkerName,
  type WorkerRegistry,
  type WorkerStatusEntry,
} from '../lib/runtime/runtime-memory'

const router = Router()

let workerStatus: WorkerRegistry = createInitialWorkerRegistry()

export function setWorkerStatus(worker: WorkerName, status: Partial<WorkerStatusEntry>) {
  workerStatus[worker] = {
    ...(workerStatus[worker] ?? {
      running: false,
      lastRun: null,
      nextRun: null,
      updatedAt: null,
    }),
    ...status,
    updatedAt: new Date().toISOString(),
  }

  void persistWorkerStatus(worker, workerStatus[worker]).catch((error) => {
    console.warn(`Failed to persist worker status for ${worker}:`, error)
  })
}

export function getWorkerStatus() {
  return workerStatus
}

export async function getWorkerStatusSnapshot() {
  const durable = await loadPersistedWorkerStatuses().catch(() => ({}))
  return mergeWorkerRegistries(workerStatus, durable)
}

/**
 * GET /api/v1/system/status
 * Returns comprehensive system health, worker status, and cache statistics.
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const startTime = Date.now()
    const runtimeIncidentSummaryPromise = getRuntimeIncidentSummary().catch((error) => {
      console.warn('Failed to get runtime incident summary:', error)
      return null
    })
    const workerSnapshotPromise = getWorkerStatusSnapshot().catch(() => workerStatus)

    // Get uptime
    const uptime = process.uptime()
    const uptimeSeconds = Math.floor(uptime)
    const uptimeMinutes = Math.floor(uptime / 60)
    const uptimeHours = Math.floor(uptime / 3600)

    // Get database status
    let dbHealthy = false
    let dbLatency = 0
    try {
      const dbStart = Date.now()
      await prisma.$queryRaw`SELECT 1`
      dbHealthy = true
      dbLatency = Date.now() - dbStart
    } catch (error) {
      dbHealthy = false
      dbLatency = -1
    }

    // Get Redis status
    let redisHealthy = false
    let redisLatency = 0
    try {
      const redisStart = Date.now()
      await redis.ping()
      redisHealthy = true
      redisLatency = Date.now() - redisStart
    } catch (error) {
      redisHealthy = false
      redisLatency = -1
    }

    // Get cache statistics
    let cacheStats = null
    let cacheHealth = null
    try {
      cacheStats = await GridSignalCache.getCacheStats()
      cacheHealth = await getCacheHealthStatus()
    } catch (error) {
      console.warn('Failed to get cache stats:', error)
    }

    // Get memory usage
    const memUsage = process.memoryUsage()

    // Decision outbox health (best effort)
    let decisionEventOutbox: null | {
      pending: number
      processing: number
      failed: number
      deadLetter: number
      sent: number
    } = null

    if (dbHealthy) {
      try {
        const [pending, processing, failed, deadLetter, sent] = await Promise.all([
          prisma.decisionEventOutbox.count({ where: { status: 'PENDING' } }),
          prisma.decisionEventOutbox.count({ where: { status: 'PROCESSING' } }),
          prisma.decisionEventOutbox.count({ where: { status: 'FAILED' } }),
          prisma.decisionEventOutbox.count({ where: { status: 'DEAD_LETTER' } }),
          prisma.decisionEventOutbox.count({ where: { status: 'SENT' } }),
        ])

        decisionEventOutbox = { pending, processing, failed, deadLetter, sent }
      } catch (error) {
        console.warn('Failed to gather decision outbox health:', error)
      }
    }

    const [runtimeIncidents, workers] = await Promise.all([
      runtimeIncidentSummaryPromise,
      workerSnapshotPromise,
    ])

    // Overall health
    const isHealthy =
      dbHealthy &&
      redisHealthy &&
      (cacheHealth?.isHealthy ?? false) &&
      ((runtimeIncidents?.openCount ?? 0) === 0)

    const totalTime = Date.now() - startTime

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: {
        seconds: uptimeSeconds,
        formatted: `${uptimeHours}h ${Math.floor((uptimeMinutes % 60))}m ${Math.floor(uptime % 60)}s`
      },
      workers,
      dependencies: {
        database: {
          healthy: dbHealthy,
          latencyMs: dbLatency >= 0 ? dbLatency : null
        },
        redis: {
          healthy: redisHealthy,
          latencyMs: redisLatency >= 0 ? redisLatency : null
        }
      },
      cache: cacheStats ? {
        totalKeys: cacheStats.totalKeys,
        keyTypes: cacheStats.keyTypes,
        l1: cacheStats.l1,
        requiredWarmCoveragePct: cacheHealth?.requiredWarmCoveragePct ?? null,
        requiredLkgCoveragePct: cacheHealth?.requiredLkgCoveragePct ?? null,
        requiredRegions: cacheHealth?.requiredRegions ?? [],
        healthy: cacheHealth?.isHealthy ?? false,
        regionCount: Object.keys(cacheStats.regions).length,
        topRegions: Object.entries(cacheStats.regions)
          .sort(([, a], [, b]) => (b as number) - (a as number))
          .slice(0, 5)
          .map(([region, count]) => ({ region, count }))
      } : null,
      memory: {
        heapUsedMb: Math.round((memUsage.heapUsed as number) / 1024 / 1024),
        heapTotalMb: Math.round((memUsage.heapTotal as number) / 1024 / 1024),
        externalMb: Math.round(((memUsage.external as number) || 0) / 1024 / 1024),
        rssMb: Math.round((memUsage.rss as number) / 1024 / 1024)
      },
      performance: {
        statusCheckMs: totalTime
      },
      decisionEventOutbox,
      runtime: runtimeIncidents,
    })
  } catch (error) {
    console.error('Error in system status endpoint:', error)
    res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * GET /api/v1/system/workers
 * Returns detailed worker status.
 */
router.get('/workers', (req: Request, res: Response) => {
  void getWorkerStatusSnapshot()
    .then((workers) => {
      res.json({
        timestamp: new Date().toISOString(),
        workers,
        uptime: {
          seconds: Math.floor(process.uptime())
        }
      })
    })
    .catch((error) => {
      console.error('Error getting worker status snapshot:', error)
      res.status(500).json({
        error: 'Failed to get worker status snapshot',
        timestamp: new Date().toISOString(),
      })
    })
})

/**
 * GET /api/v1/system/cache
 * Returns cache statistics and health.
 */
router.get('/cache', async (req: Request, res: Response) => {
  try {
    const cacheHealth = await getCacheHealthStatus()
    const cacheStats = cacheHealth.cacheStats ?? (await GridSignalCache.getCacheStats().catch(() => null))

    res.json({
      timestamp: new Date().toISOString(),
      cache: {
        totalKeys: cacheStats?.totalKeys ?? 0,
        keyTypes: cacheStats?.keyTypes ?? {},
        regions: cacheStats?.regions ?? {},
        l1: cacheStats?.l1 ?? {
          routingSignalEntries: 0,
          routingLkgEntries: 0,
        },
        regionCount: Object.keys(cacheStats?.regions ?? {}).length,
        requiredWarmCoveragePct: cacheHealth.requiredWarmCoveragePct,
        requiredLkgCoveragePct: cacheHealth.requiredLkgCoveragePct,
        requiredRegions: cacheHealth.requiredRegions,
        healthy: cacheHealth.isHealthy,
        redisConnected: cacheHealth.redisConnected,
      }
    })
  } catch (error) {
    console.error('Error getting cache stats:', error)
    res.status(503).json({
      status: 'degraded',
      error: error instanceof Error ? error.message : 'Failed to get cache statistics',
      timestamp: new Date().toISOString(),
      cache: {
        totalKeys: 0,
        keyTypes: {},
        regions: {},
        l1: {
          routingSignalEntries: 0,
          routingLkgEntries: 0,
        },
        regionCount: 0,
        requiredWarmCoveragePct: 0,
        requiredLkgCoveragePct: 0,
        requiredRegions: [],
        healthy: false,
        redisConnected: false,
      }
    })
  }
})

export default router
