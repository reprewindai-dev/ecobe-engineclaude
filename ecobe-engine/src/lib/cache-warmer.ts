import { env } from '../config/env'
import { setWorkerStatus } from '../routes/system'
import { providerRouter } from './carbon/provider-router'
import { GridSignalCache } from './grid-signals/grid-signal-cache'
import { recordTelemetryMetric, telemetryMetricNames } from './observability/telemetry'
import { redis } from './redis'
import { gbCarbonIntensity } from './gb-carbon-intensity'
import { storeProviderSnapshot } from './routing/provider-snapshots'

const DEFAULT_SUPPORTED_REGIONS = [
  'us-east-1',
  'us-west-2',
  'eu-west-1',
  'eu-central-1',
  'ap-southeast-1',
  'ap-northeast-1',
]

const SUPPORTED_REGIONS =
  env.ROUTING_SIGNAL_REQUIRED_REGIONS.length > 0
    ? env.ROUTING_SIGNAL_REQUIRED_REGIONS
    : DEFAULT_SUPPORTED_REGIONS

const recentRegions = new Map<string, number>()
let warmLoopTimer: NodeJS.Timeout | null = null
let lastAmbientProviderProbeAt = 0
const AMBIENT_PROVIDER_PROBE_INTERVAL_MS = 15 * 60 * 1000

function getWarmRegions() {
  const now = Date.now()
  const cutoff = now - 2 * 60 * 60 * 1000

  for (const [region, lastSeenAt] of recentRegions.entries()) {
    if (lastSeenAt < cutoff) {
      recentRegions.delete(region)
    }
  }

  return Array.from(new Set([...SUPPORTED_REGIONS, ...recentRegions.keys()]))
}

export function getRequiredRoutingRegions() {
  return [...SUPPORTED_REGIONS]
}

export function trackRecentRoutingRegions(regions: string[]) {
  const now = Date.now()
  for (const region of regions) {
    recentRegions.set(region, now)
  }
}

export async function warmCacheOnStartup(): Promise<void> {
  const startedAt = Date.now()
  const nextRunAt = new Date(startedAt + Math.max(5_000, env.ROUTING_SIGNAL_WARM_LOOP_INTERVAL_MS))

  setWorkerStatus('routingSignalWarmLoop', {
    running: true,
    lastRun: new Date(startedAt).toISOString(),
    nextRun: nextRunAt.toISOString(),
  })

  try {
    const regions = getWarmRegions()
    console.log(`Starting routing cache warming for ${regions.length} regions...`)

    const results = await Promise.allSettled(
      regions.map(async (region) => {
        const currentBucket = new Date()
        currentBucket.setSeconds(0, 0)
        const nextBucket = new Date(currentBucket.getTime() + 60_000)
        const record = await providerRouter.getRoutingSignalRecord(region, currentBucket)

        await Promise.all([
          providerRouter.cacheRoutingSignal(region, record, currentBucket),
          providerRouter.cacheRoutingSignal(region, record, nextBucket),
        ])

        return {
          region,
          status: 'ok' as const,
          carbonIntensity: record.signal.carbonIntensity,
          confidence: record.signal.confidence,
          source: record.signal.provenance.sourceUsed,
        }
      })
    )

    const succeeded = results.filter(
      (result) => result.status === 'fulfilled' && result.value.status === 'ok'
    ).length

    recordTelemetryMetric(telemetryMetricNames.routingWarmLoopCycleCount, 'counter', 1, {
      requested_regions: regions.length,
      warmed_regions: succeeded,
    })
    recordTelemetryMetric(
      telemetryMetricNames.routingCacheCoveragePct,
      'gauge',
      regions.length > 0 ? (succeeded / regions.length) * 100 : 0,
      { scope: 'warm_loop' }
    )
    recordTelemetryMetric(
      telemetryMetricNames.routingWarmLoopLagSeconds,
      'gauge',
      Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
      { scope: 'warm_loop' }
    )

    console.log(`Routing cache warming complete: ${succeeded}/${regions.length} regions warmed`)

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const value = result.value
        if (value.status === 'ok') {
          console.log(
            `  warm ${value.region}: ${value.carbonIntensity} gCO2/kWh (confidence ${(value.confidence * 100).toFixed(0)}%, source ${value.source})`
          )
        }
      } else {
        console.warn(`  warm failure: ${String(result.reason)}`)
      }
    }

    await probeAmbientProviders()
  } catch (error) {
    console.error('Fatal error during routing cache warming:', error)
    recordTelemetryMetric(telemetryMetricNames.routingWarmLoopFailureCount, 'counter', 1, {
      scope: 'warm_loop',
    })
  } finally {
    setWorkerStatus('routingSignalWarmLoop', {
      running: Boolean(warmLoopTimer),
      nextRun: nextRunAt.toISOString(),
    })
  }
}

async function probeAmbientProviders() {
  const now = Date.now()
  if (now - lastAmbientProviderProbeAt < AMBIENT_PROVIDER_PROBE_INTERVAL_MS) {
    return
  }

  lastAmbientProviderProbeAt = now

  try {
    const current = await gbCarbonIntensity.getCurrentIntensity()
    const signalValue = current?.intensity.actual ?? current?.intensity.forecast ?? null
    if (current && signalValue != null) {
      const observedAt = new Date(current.from)
      const freshnessSec = Math.max(0, Math.round((Date.now() - observedAt.getTime()) / 1000))

      await storeProviderSnapshot({
        provider: 'GB_CARBON',
        zone: 'GB',
        signalType: 'carbon_intensity',
        signalValue,
        observedAt,
        freshnessSec,
        confidence: current.intensity.actual == null ? 0.75 : 0.85,
        metadata: {
          probeSource: 'ambient_warm_loop',
          index: current.intensity.index,
          forecastUsed: current.intensity.actual == null,
        },
      })
    }
  } catch (error) {
    console.warn('Ambient provider probe failed:', error)
  }
}

export function startRoutingSignalWarmLoop() {
  if (warmLoopTimer) return

  const intervalMs = Math.max(5_000, env.ROUTING_SIGNAL_WARM_LOOP_INTERVAL_MS)
  warmLoopTimer = setInterval(() => {
    void warmCacheOnStartup().catch((error) => {
      console.error('Routing signal warm loop failed:', error)
    })
  }, intervalMs)
  warmLoopTimer.unref?.()

  setWorkerStatus('routingSignalWarmLoop', {
    running: true,
    lastRun: null,
    nextRun: new Date(Date.now() + intervalMs).toISOString(),
  })
}

export function stopRoutingSignalWarmLoop() {
  if (!warmLoopTimer) return
  clearInterval(warmLoopTimer)
  warmLoopTimer = null

  setWorkerStatus('routingSignalWarmLoop', {
    running: false,
    nextRun: null,
  })
}

export async function getCacheHealthStatus(): Promise<{
  isHealthy: boolean
  redisConnected: boolean
  requiredWarmCoveragePct: number
  requiredLkgCoveragePct: number
  requiredRegions: string[]
  cacheStats: {
    totalKeys: number
    keyTypes: Record<string, number>
    regions: Record<string, number>
    l1: {
      routingSignalEntries: number
      routingLkgEntries: number
    }
  } | null
}> {
  try {
    const redisHealthy = await redis.ping().then(() => true).catch(() => false)

    if (!redisHealthy) {
      return {
        isHealthy: false,
        redisConnected: false,
        requiredWarmCoveragePct: 0,
        requiredLkgCoveragePct: 0,
        requiredRegions: SUPPORTED_REGIONS,
        cacheStats: null,
      }
    }

    const cacheStats = await GridSignalCache.getCacheStats()
    const currentBucket = new Date()
    currentBucket.setSeconds(0, 0)
    const nextBucket = new Date(currentBucket.getTime() + 60_000)

    const [warmCoverage, lkgCoverage] = await Promise.all([
      Promise.all(
        SUPPORTED_REGIONS.map(async (region) => {
          const [current, next] = await Promise.all([
            GridSignalCache.getCachedRoutingSignal(region, currentBucket.toISOString()),
            GridSignalCache.getCachedRoutingSignal(region, nextBucket.toISOString()),
          ])
          return Boolean(current && next)
        })
      ),
      Promise.all(
        SUPPORTED_REGIONS.map(async (region) =>
          Boolean(await GridSignalCache.getLastKnownGoodRoutingSignal(region))
        )
      ),
    ])

    const requiredWarmCoveragePct =
      SUPPORTED_REGIONS.length > 0
        ? (warmCoverage.filter(Boolean).length / SUPPORTED_REGIONS.length) * 100
        : 0
    const requiredLkgCoveragePct =
      SUPPORTED_REGIONS.length > 0
        ? (lkgCoverage.filter(Boolean).length / SUPPORTED_REGIONS.length) * 100
        : 0

    return {
      isHealthy: cacheStats.totalKeys > 0 && requiredWarmCoveragePct >= 100 && requiredLkgCoveragePct >= 100,
      redisConnected: true,
      requiredWarmCoveragePct: Number(requiredWarmCoveragePct.toFixed(3)),
      requiredLkgCoveragePct: Number(requiredLkgCoveragePct.toFixed(3)),
      requiredRegions: SUPPORTED_REGIONS,
      cacheStats,
    }
  } catch (error) {
    console.error('Error getting cache health status:', error)
    return {
      isHealthy: false,
      redisConnected: false,
      requiredWarmCoveragePct: 0,
      requiredLkgCoveragePct: 0,
      requiredRegions: SUPPORTED_REGIONS,
      cacheStats: null,
    }
  }
}
