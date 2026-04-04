import { env } from '../config/env'
import { setWorkerStatus } from '../routes/system'
import { providerRouter } from './carbon/provider-router'
import { denmarkCarbon } from './denmark-carbon'
import { finlandCarbon } from './finland-carbon'
import { gbCarbonIntensity } from './gb-carbon-intensity'
import { GridSignalCache } from './grid-signals/grid-signal-cache'
import { recordTelemetryMetric } from './observability/telemetry'
import { redis } from './redis'

const DEFAULT_SUPPORTED_REGIONS = [
  'us-east-1',
  'us-west-2',
  'eu-west-1',
  'eu-central-1',
  'ap-southeast-1',
  'ap-northeast-1',
]

const configuredRequiredRegions = process.env.ROUTING_SIGNAL_REQUIRED_REGIONS
  ?.split(',')
  .map((region) => region.trim())
  .filter(Boolean)

const SUPPORTED_REGIONS =
  configuredRequiredRegions && configuredRequiredRegions.length > 0
    ? configuredRequiredRegions
    : DEFAULT_SUPPORTED_REGIONS

const AMBIENT_PROVIDER_PROBE_INTERVAL_MS = 15 * 60 * 1000
const WARM_LOOP_INTERVAL_MS = Math.max(
  5_000,
  Number.parseInt(process.env.ROUTING_SIGNAL_WARM_LOOP_INTERVAL_MS ?? '', 10) || 30_000
)
const recentRegions = new Map<string, number>()
let warmLoopTimer: NodeJS.Timeout | null = null
let lastAmbientProviderProbeAt = 0
const routingWarmLoopCycleMetric = 'ecobe.routing.warm_loop.cycle.count'
const routingCacheCoverageMetric = 'ecobe.routing.cache.coverage.pct'
const routingWarmLoopLagMetric = 'ecobe.routing.warm_loop.lag.seconds'
const routingWarmLoopFailureMetric = 'ecobe.routing.warm_loop.failure.count'

async function runAmbientProviderProbe() {
  const probes: Promise<unknown>[] = [gbCarbonIntensity.getCurrentIntensity(), denmarkCarbon.getCurrentIntensity()]

  if (finlandCarbon.isAvailable) {
    probes.push(finlandCarbon.getCurrentIntensity())
  }

  await Promise.allSettled(probes)
}

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
  const nextRunAt = new Date(startedAt + WARM_LOOP_INTERVAL_MS)

  setWorkerStatus('routingSignalWarmLoop', {
    running: true,
    lastRun: new Date(startedAt).toISOString(),
    nextRun: nextRunAt.toISOString(),
  })

  try {
    if (Date.now() - lastAmbientProviderProbeAt >= AMBIENT_PROVIDER_PROBE_INTERVAL_MS) {
      lastAmbientProviderProbeAt = Date.now()
      await runAmbientProviderProbe()
    }

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

    recordTelemetryMetric(routingWarmLoopCycleMetric, 'counter', 1, {
      requested_regions: regions.length,
      warmed_regions: succeeded,
    })
    recordTelemetryMetric(
      routingCacheCoverageMetric,
      'gauge',
      regions.length > 0 ? (succeeded / regions.length) * 100 : 0,
      { scope: 'warm_loop' }
    )
    recordTelemetryMetric(
      routingWarmLoopLagMetric,
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
  } catch (error) {
    console.error('Fatal error during routing cache warming:', error)
    recordTelemetryMetric(routingWarmLoopFailureMetric, 'counter', 1, {
      scope: 'warm_loop',
    })
  } finally {
    setWorkerStatus('routingSignalWarmLoop', {
      running: Boolean(warmLoopTimer),
      nextRun: nextRunAt.toISOString(),
    })
  }
}

export function startRoutingSignalWarmLoop() {
  if (warmLoopTimer) return

  warmLoopTimer = setInterval(() => {
    void warmCacheOnStartup().catch((error) => {
      console.error('Routing signal warm loop failed:', error)
    })
  }, WARM_LOOP_INTERVAL_MS)
  warmLoopTimer.unref?.()

  setWorkerStatus('routingSignalWarmLoop', {
    running: true,
    lastRun: null,
    nextRun: new Date(Date.now() + WARM_LOOP_INTERVAL_MS).toISOString(),
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
    l1?: {
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
        SUPPORTED_REGIONS.map(async (region: string) => {
          const [current, next] = await Promise.all([
            GridSignalCache.getCachedRoutingSignal(region, currentBucket.toISOString()),
            GridSignalCache.getCachedRoutingSignal(region, nextBucket.toISOString()),
          ])
          return Boolean(current && next)
        })
      ),
      Promise.all(
        SUPPORTED_REGIONS.map(async (region: string) =>
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
