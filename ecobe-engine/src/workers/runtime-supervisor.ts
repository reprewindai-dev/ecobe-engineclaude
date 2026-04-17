import { env } from '../config/env'
import {
  getDecisionEventOutboxOperationalStatus,
  requeueRecoverableSystemDeadLetters,
} from '../lib/ci/decision-events'
import { getCacheHealthStatus, warmCacheOnStartup } from '../lib/cache-warmer'
import { prisma } from '../lib/db'
import { recordTelemetryMetric, telemetryMetricNames } from '../lib/observability/telemetry'
import { redis } from '../lib/redis'
import {
  getRuntimeIncidentSummary,
  recordRuntimeIncident,
  resolveRuntimeIncident,
  type WorkerStatusEntry,
} from '../lib/runtime/runtime-memory'
import { getProviderFreshness } from '../lib/routing'
import { recoverWaterArtifactsFromLastKnownGood, validateWaterArtifacts } from '../lib/water/bundle'
import { getWorkerStatusSnapshot, setWorkerStatus } from '../routes/system'
import { runForecastRefresh } from './forecast-poller'
import { refreshRegionReliabilityModel } from './learning-loop'
import { scheduleIntelligenceJobs } from './intelligence-scheduler'
import { runDecisionEventDispatchCycle } from './decision-event-dispatcher'

let supervisorTimer: NodeJS.Timeout | null = null
let running = false

function parseIso(iso: string | null): number | null {
  if (!iso) return null
  const ts = new Date(iso).getTime()
  return Number.isFinite(ts) ? ts : null
}

function isWorkerStale(lastRun: string | null, staleMinutes: number): boolean {
  const ts = parseIso(lastRun)
  if (!ts) return true
  return Date.now() - ts > staleMinutes * 60 * 1000
}

async function reconcileDependencyIncident(
  incidentKey: string,
  component: string,
  healthy: boolean,
  summary: string,
  details: Record<string, unknown>
) {
  try {
    if (healthy) {
      await resolveRuntimeIncident(incidentKey, details)
      return
    }

    await recordRuntimeIncident({
      incidentKey,
      component,
      severity: 'critical',
      summary,
      details,
    })
  } catch (error) {
    console.error(`Failed to reconcile dependency incident ${incidentKey}:`, error)
  }
}

async function reconcileWorkerIncident(
  worker: string,
  stale: boolean,
  status: WorkerStatusEntry | undefined,
  staleMinutes: number
) {
  const incidentKey = `worker:${worker}:stale`
  if (!stale) {
    await resolveRuntimeIncident(incidentKey, {
      worker,
      staleMinutes,
      lastRun: status?.lastRun ?? null,
      nextRun: status?.nextRun ?? null,
    })
    return
  }

  await recordRuntimeIncident({
    incidentKey,
    component: worker,
    severity: 'high',
    summary: `Worker ${worker} is stale`,
    details: {
      worker,
      staleMinutes,
      lastRun: status?.lastRun ?? null,
      nextRun: status?.nextRun ?? null,
      running: status?.running ?? false,
    },
  })
}

async function runSupervisorCycle() {
  if (running) return
  running = true

  const startedAt = new Date()
  const intervalMs = Math.max(10, env.RUNTIME_SUPERVISOR_INTERVAL_SEC) * 1000

  try {
    const workerStatus = await getWorkerStatusSnapshot()
    let dbHealthy = true
    let redisHealthy = true

    try {
      await prisma.$queryRaw`SELECT 1`
    } catch (error) {
      dbHealthy = false
      console.error('Runtime supervisor: database ping failed', error)
    }

    try {
      await redis.ping()
    } catch (error) {
      redisHealthy = false
      console.error('Runtime supervisor: redis ping failed', error)
    }

    await Promise.all([
      reconcileDependencyIncident('dependency:database', 'database', dbHealthy, 'Database dependency degraded', {
        dependency: 'database',
        checkedAt: startedAt.toISOString(),
      }),
      reconcileDependencyIncident('dependency:redis', 'redis', redisHealthy, 'Redis dependency degraded', {
        dependency: 'redis',
        checkedAt: startedAt.toISOString(),
      }),
    ])

    let cacheHealth = await getCacheHealthStatus()
    recordTelemetryMetric(
      telemetryMetricNames.routingCacheCoveragePct,
      'gauge',
      cacheHealth.requiredWarmCoveragePct,
      { scope: 'required_warm_regions' }
    )
    if (!cacheHealth.isHealthy) {
      console.warn('Runtime supervisor detected degraded routing cache health', cacheHealth)
      await recordRuntimeIncident({
        incidentKey: 'routing-cache:coverage',
        component: 'routing-cache',
        severity: 'high',
        summary: 'Required routing cache coverage degraded',
        details: {
          requiredWarmCoveragePct: cacheHealth.requiredWarmCoveragePct,
          requiredLkgCoveragePct: cacheHealth.requiredLkgCoveragePct,
          requiredRegions: cacheHealth.requiredRegions,
        },
      })

      await warmCacheOnStartup()
      cacheHealth = await getCacheHealthStatus()
    }

    if (cacheHealth.isHealthy) {
      await resolveRuntimeIncident('routing-cache:coverage', {
        requiredWarmCoveragePct: cacheHealth.requiredWarmCoveragePct,
        requiredLkgCoveragePct: cacheHealth.requiredLkgCoveragePct,
      })
    }

    const artifactHealth = validateWaterArtifacts()
    if (!artifactHealth.healthy) {
      await recordRuntimeIncident({
        incidentKey: 'water-artifacts:invalid',
        component: 'water-artifacts',
        severity: 'critical',
        summary: 'Water artifact bundle validation failed',
        details: artifactHealth as Record<string, unknown>,
      })

      const recovery = recoverWaterArtifactsFromLastKnownGood()
      if (recovery.recovered) {
        console.warn('Runtime supervisor recovered water artifacts from last-known-good snapshot')
        const recoveredHealth = validateWaterArtifacts()
        if (recoveredHealth.healthy) {
          await resolveRuntimeIncident('water-artifacts:invalid', {
            recovered: true,
            recoveredAt: new Date().toISOString(),
          })
        }
      } else {
        console.error('Runtime supervisor could not recover water artifacts:', recovery.reason)
      }
    } else {
      await resolveRuntimeIncident('water-artifacts:invalid', {
        recovered: true,
        checkedAt: new Date().toISOString(),
      })
    }

    const providerFreshness = await getProviderFreshness().catch(() => [])
    const staleProviders = providerFreshness.filter((provider) => provider.isStale)
    recordTelemetryMetric(
      telemetryMetricNames.providerStaleCount,
      'gauge',
      staleProviders.length,
      { scope: 'runtime_supervisor' }
    )

    if (staleProviders.length > 0) {
      await recordRuntimeIncident({
        incidentKey: 'providers:stale',
        component: 'provider-freshness',
        severity: 'high',
        summary: 'One or more routing providers are stale',
        details: {
          providers: staleProviders,
        },
      })

      await warmCacheOnStartup()
    } else {
      await resolveRuntimeIncident('providers:stale', {
        checkedAt: new Date().toISOString(),
      })
    }

    if (
      env.FORECAST_REFRESH_ENABLED &&
      isWorkerStale(workerStatus.forecastPoller?.lastRun ?? null, env.SUPERVISOR_FORECAST_STALE_MIN)
    ) {
      await reconcileWorkerIncident(
        'forecastPoller',
        true,
        workerStatus.forecastPoller,
        env.SUPERVISOR_FORECAST_STALE_MIN
      )
      console.warn('Runtime supervisor detected stale forecast worker, forcing refresh run')
      await runForecastRefresh()
    } else {
      await reconcileWorkerIncident(
        'forecastPoller',
        false,
        workerStatus.forecastPoller,
        env.SUPERVISOR_FORECAST_STALE_MIN
      )
    }

    if (
      isWorkerStale(
        workerStatus.intelligenceJobs?.lastRun ?? null,
        env.SUPERVISOR_INTELLIGENCE_STALE_MIN
      )
    ) {
      await reconcileWorkerIncident(
        'intelligenceJobs',
        true,
        workerStatus.intelligenceJobs,
        env.SUPERVISOR_INTELLIGENCE_STALE_MIN
      )
      console.warn('Runtime supervisor detected stale intelligence scheduler, re-running schedule sync')
      await scheduleIntelligenceJobs()
    } else {
      await reconcileWorkerIncident(
        'intelligenceJobs',
        false,
        workerStatus.intelligenceJobs,
        env.SUPERVISOR_INTELLIGENCE_STALE_MIN
      )
    }

    if (
      env.LEARNING_LOOP_ENABLED &&
      isWorkerStale(workerStatus.learningLoop?.lastRun ?? null, env.SUPERVISOR_LEARNING_STALE_MIN)
    ) {
      await reconcileWorkerIncident(
        'learningLoop',
        true,
        workerStatus.learningLoop,
        env.SUPERVISOR_LEARNING_STALE_MIN
      )
      console.warn('Runtime supervisor detected stale learning loop, forcing refresh run')
      await refreshRegionReliabilityModel()
    } else {
      await reconcileWorkerIncident(
        'learningLoop',
        false,
        workerStatus.learningLoop,
        env.SUPERVISOR_LEARNING_STALE_MIN
      )
    }

    if (
      env.DECISION_EVENT_DISPATCH_ENABLED &&
      isWorkerStale(
        workerStatus.decisionEventDispatcher?.lastRun ?? null,
        env.SUPERVISOR_DECISION_EVENT_STALE_MIN
      )
    ) {
      await reconcileWorkerIncident(
        'decisionEventDispatcher',
        true,
        workerStatus.decisionEventDispatcher,
        env.SUPERVISOR_DECISION_EVENT_STALE_MIN
      )
      console.warn('Runtime supervisor detected stale decision event dispatcher, forcing cycle')
      await runDecisionEventDispatchCycle()
    } else {
      await reconcileWorkerIncident(
        'decisionEventDispatcher',
        false,
        workerStatus.decisionEventDispatcher,
        env.SUPERVISOR_DECISION_EVENT_STALE_MIN
      )
    }

    const warmLoopStaleMinutes = Math.max(2, Math.ceil((env.ROUTING_SIGNAL_WARM_LOOP_INTERVAL_MS * 4) / 60_000))
    if (isWorkerStale(workerStatus.routingSignalWarmLoop?.lastRun ?? null, warmLoopStaleMinutes)) {
      await reconcileWorkerIncident(
        'routingSignalWarmLoop',
        true,
        workerStatus.routingSignalWarmLoop,
        warmLoopStaleMinutes
      )
      console.warn('Runtime supervisor detected stale routing warm loop, forcing cache warm run')
      await warmCacheOnStartup()
    } else {
      await reconcileWorkerIncident(
        'routingSignalWarmLoop',
        false,
        workerStatus.routingSignalWarmLoop,
        warmLoopStaleMinutes
      )
    }

    if (dbHealthy) {
      const {
        pending,
        deadLetter,
        deadLetterTotal,
        oldestPendingCreatedAt,
      } = await getDecisionEventOutboxOperationalStatus()

      const oldestPendingLagMinutes = oldestPendingCreatedAt
        ? Math.max(0, Math.round((Date.now() - oldestPendingCreatedAt.getTime()) / 60_000))
        : 0
      const outboxDegraded =
        deadLetter >= env.DECISION_EVENT_ALERT_DEADLETTER_COUNT ||
        oldestPendingLagMinutes >= env.DECISION_EVENT_ALERT_LAG_MINUTES

      recordTelemetryMetric(
        telemetryMetricNames.outboxLagSeconds,
        'gauge',
        oldestPendingCreatedAt
          ? Math.max(0, Math.round((Date.now() - oldestPendingCreatedAt.getTime()) / 1000))
          : 0,
        { scope: 'runtime_supervisor' }
      )

      if (outboxDegraded) {
        await recordRuntimeIncident({
          incidentKey: 'decision-outbox:degraded',
          component: 'decision-event-outbox',
          severity: deadLetter > 0 ? 'critical' : 'high',
          summary: 'Decision event outbox is degraded',
          details: {
            pendingCount: pending,
            deadLetterCount: deadLetter,
            deadLetterTotal,
            oldestPendingLagMinutes,
          },
        })

        if (env.DECISION_EVENT_DISPATCH_ENABLED) {
          await requeueRecoverableSystemDeadLetters()
          await runDecisionEventDispatchCycle()
        }
      } else {
        await resolveRuntimeIncident('decision-outbox:degraded', {
          pendingCount: pending,
          deadLetterCount: deadLetter,
          deadLetterTotal,
          oldestPendingLagMinutes,
        })
      }
    }

    const runtimeSummary = await getRuntimeIncidentSummary().catch(() => null)
    recordTelemetryMetric(
      telemetryMetricNames.runtimeOpenIncidentCount,
      'gauge',
      runtimeSummary?.openCount ?? 0,
      { scope: 'runtime_supervisor' }
    )
    await resolveRuntimeIncident('runtime-supervisor:cycle-failed', {
      recovered: true,
      checkedAt: new Date().toISOString(),
    })

    setWorkerStatus('runtimeSupervisor', {
      running: true,
      lastRun: startedAt.toISOString(),
      nextRun: new Date(Date.now() + intervalMs).toISOString(),
    })
  } catch (error) {
    console.error('Runtime supervisor cycle failed:', error)
    await recordRuntimeIncident({
      incidentKey: 'runtime-supervisor:cycle-failed',
      component: 'runtime-supervisor',
      severity: 'critical',
      summary: 'Runtime supervisor cycle failed',
      details: {
        error: error instanceof Error ? error.message : String(error),
      },
    }).catch(() => undefined)
    setWorkerStatus('runtimeSupervisor', {
      running: false,
      lastRun: startedAt.toISOString(),
      nextRun: new Date(Date.now() + intervalMs).toISOString(),
    })
  } finally {
    running = false
  }
}

export function startRuntimeSupervisor() {
  if (!env.RUNTIME_SUPERVISOR_ENABLED) {
    console.log('Runtime supervisor disabled')
    return
  }

  if (supervisorTimer) return

  const intervalMs = Math.max(10, env.RUNTIME_SUPERVISOR_INTERVAL_SEC) * 1000
  console.log(`Runtime supervisor started (every ${Math.round(intervalMs / 1000)}s)`)

  setWorkerStatus('runtimeSupervisor', {
    running: true,
    lastRun: null,
    nextRun: new Date(Date.now() + intervalMs).toISOString(),
  })

  void runSupervisorCycle()
  supervisorTimer = setInterval(() => {
    void runSupervisorCycle()
  }, intervalMs)
}

export function stopRuntimeSupervisor() {
  if (supervisorTimer) {
    clearInterval(supervisorTimer)
    supervisorTimer = null
  }
  setWorkerStatus('runtimeSupervisor', {
    running: false,
    nextRun: null,
  })
}
