import { env } from '../config/env'
import { setWorkerStatus } from '../routes/system'
import { providerRouter } from './carbon/provider-router'
import { GridSignalCache } from './grid-signals/grid-signal-cache'
import { recordTelemetryMetric, telemetryMetricNames } from './observability/telemetry'
import { redis } from './redis'
import { storeProviderSnapshot } from './routing/provider-snapshots'

const DEFAULT_SUPPORTED_REGIONS = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'us-central-1',
  'eu-west-1',
  'eu-west-2',
  'eu-central-1',
  'ap-southeast-1',
  'ap-northeast-1',
  'ap-south-1',
]

const SUPPORTED_REGIONS =
  env.ROUTING_SIGNAL_REQUIRED_REGIONS.length > 0
    ? env.ROUTING_SIGNAL_REQUIRED_REGIONS
    : DEFAULT_SUPPORTED_REGIONS

const recentRegions = new Map<string, number>()
let warmLoopTimer: NodeJS.Timeout | null = null
let warmCycleRunning = false

function resolveCanonicalProvider(record: Awaited<ReturnType<typeof providerRouter.getRoutingSignalRecord>>): string | null {
  const sourceUsed = record.signal.provenance.sourceUsed.toUpperCase()

  if (sourceUsed.includes('WATTTIME')) return 'WATTTIME_MOER'
  if (sourceUsed.includes('EIA930')) return 'EIA_930'
  if (sourceUsed.includes('GRIDSTATUS')) return 'GRIDSTATUS'
  if (sourceUsed.includes('EMBER')) return 'EMBER_STRUCTURAL_BASELINE'
  if (record.signal.source === 'gb_carbon_intensity') return 'GB_CARBON'
  if (record.signal.source === 'dk_carbon') return 'DK_CARBON'
  if (record.signal.source === 'fi_carbon') return 'FI_CARBON'
  if (record.signal.source === 'on_carbon') return 'ON_CARBON'
  if (record.signal.source === 'qc_carbon') return 'QC_CARBON'
  if (record.signal.source === 'bc_carbon') return 'BC_CARBON'

  return null
}

async function persistWarmLoopProviderSnapshot(
  region: string,
  record: Awaited<ReturnType<typeof providerRouter.getRoutingSignalRecord>>
) {
  if (record.cacheSource !== 'live' || record.signal.provenance.fallbackUsed) {
    return
  }

  const provider = resolveCanonicalProvider(record)
  if (!provider) {
    return
  }

  const observedAt = new Date(record.signal.provenance.referenceTime || record.signal.provenance.fetchedAt)
  if (Number.isNaN(observedAt.getTime())) {
    return
  }

  const freshnessSec =
    record.stalenessSec ?? Math.max(0, Math.floor((Date.now() - observedAt.getTime()) / 1000))

  await storeProviderSnapshot({
    provider,
    zone: region,
    signalType: record.signal.signalMode === 'marginal' ? 'moer' : 'intensity',
    signalValue: record.signal.carbonIntensity,
    forecastForTs: record.signal.isForecast ? observedAt : undefined,
    observedAt,
    freshnessSec,
    confidence: record.signal.confidence,
    metadata: {
      sourceUsed: record.signal.provenance.sourceUsed,
      contributingSources: record.signal.provenance.contributingSources,
      cacheSource: record.cacheSource,
      signalMode: record.signal.signalMode,
      accountingMethod: record.signal.accountingMethod,
      validationNotes: record.signal.provenance.validationNotes ?? null,
    },
  })
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
  if (warmCycleRunning) {
    return
  }

  warmCycleRunning = true
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
          persistWarmLoopProviderSnapshot(region, record),
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
  } catch (error) {
    console.error('Fatal error during routing cache warming:', error)
    recordTelemetryMetric(telemetryMetricNames.routingWarmLoopFailureCount, 'counter', 1, {
      scope: 'warm_loop',
    })
  } finally {
    warmCycleRunning = false
    setWorkerStatus('routingSignalWarmLoop', {
      running: Boolean(warmLoopTimer),
      lastRun: new Date().toISOString(),
      nextRun: nextRunAt.toISOString(),
    })
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
    const [warmCoverage, lkgCoverage] = await Promise.all([
      Promise.all(
        SUPPORTED_REGIONS.map(async (region) => {
          const current = await GridSignalCache.getCachedRoutingSignal(region, currentBucket.toISOString())
          return Boolean(current)
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
