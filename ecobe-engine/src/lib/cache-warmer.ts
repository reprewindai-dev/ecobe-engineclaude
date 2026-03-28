import { providerRouter } from './carbon/provider-router'
import { GridSignalCache } from './grid-signals/grid-signal-cache'
import { env } from '../config/env'
import { redis } from './redis'

const SUPPORTED_REGIONS = [
  'us-east-1', 'us-west-2', 'eu-west-1',
  'eu-central-1', 'ap-southeast-1', 'ap-northeast-1'
]

const recentRegions = new Map<string, number>()
let warmLoopTimer: NodeJS.Timeout | null = null

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

export function trackRecentRoutingRegions(regions: string[]) {
  const now = Date.now()
  for (const region of regions) {
    recentRegions.set(region, now)
  }
}

export async function warmCacheOnStartup(): Promise<void> {
  try {
    const regions = getWarmRegions()
    console.log(`🔥 Starting cache warming for ${regions.length} regions...`)

    const results = await Promise.allSettled(
      regions.map(async (region) => {
        try {
          const timestamp = new Date()
          const record = await providerRouter.getRoutingSignalRecord(region, timestamp)
          // Cache the routing signal
          await providerRouter.cacheRoutingSignal(region, record, timestamp)
          return {
            region,
            status: 'ok' as const,
            carbonIntensity: record.signal.carbonIntensity,
            confidence: record.signal.confidence,
            source: record.signal.provenance.sourceUsed,
          }
        } catch (error) {
          return {
            region,
            status: 'failed' as const,
            error: String(error)
          }
        }
      })
    )

    const succeeded = results.filter(r => r.status === 'fulfilled' && (r.value as any).status === 'ok').length
    console.log(`🔥 Cache warming complete: ${succeeded}/${regions.length} regions warmed`)

    // Log results
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const value = result.value as any
        if (value.status === 'ok') {
          console.log(`   ✓ ${value.region}: ${value.carbonIntensity} gCO2/kWh (confidence: ${(value.confidence * 100).toFixed(0)}%, source: ${value.source})`)
        } else {
          console.log(`   ✗ ${value.region}: ${value.error}`)
        }
      } else {
        console.log(`   ✗ Failed to warm cache: ${String(result.reason)}`)
      }
    }
  } catch (error) {
    console.error('Fatal error during cache warming:', error)
    // Don't throw - allow server to continue even if cache warming fails
  }
}

export function startRoutingSignalWarmLoop() {
  if (warmLoopTimer) return

  const intervalMs = Math.max(30_000, Math.floor((env.GRID_SIGNAL_CACHE_TTL * 1000) / 3))
  warmLoopTimer = setInterval(() => {
    void warmCacheOnStartup().catch((error) => {
      console.error('Routing signal warm loop failed:', error)
    })
  }, intervalMs)
  warmLoopTimer.unref?.()
}

export function stopRoutingSignalWarmLoop() {
  if (!warmLoopTimer) return
  clearInterval(warmLoopTimer)
  warmLoopTimer = null
}

export async function getCacheHealthStatus(): Promise<{
  isHealthy: boolean
  redisConnected: boolean
  cacheStats: {
    totalKeys: number
    keyTypes: Record<string, number>
    regions: Record<string, number>
  } | null
}> {
  try {
    const redisHealthy = await redis.ping().then(() => true).catch(() => false)

    if (!redisHealthy) {
      return {
        isHealthy: false,
        redisConnected: false,
        cacheStats: null
      }
    }

    const cacheStats = await GridSignalCache.getCacheStats()

    return {
      isHealthy: cacheStats.totalKeys > 0,
      redisConnected: true,
      cacheStats
    }
  } catch (error) {
    console.error('Error getting cache health status:', error)
    return {
      isHealthy: false,
      redisConnected: false,
      cacheStats: null
    }
  }
}
