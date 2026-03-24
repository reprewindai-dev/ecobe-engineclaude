import { providerRouter } from './carbon/provider-router'
import { GridSignalCache } from './grid-signals/grid-signal-cache'
import { redis } from './redis'

const SUPPORTED_REGIONS = [
  'us-east-1',
  'us-west-2',
  'eu-west-1',
  'eu-central-1',
  'ap-southeast-1',
  'ap-northeast-1',
]

export async function warmCacheOnStartup(regions: string[] = SUPPORTED_REGIONS): Promise<{
  attempted: number
  succeeded: number
  failed: number
  regions: string[]
}> {
  try {
    console.log(`Starting cache warming for ${regions.length} regions...`)

    const results = await Promise.allSettled(
      regions.map(async (region) => {
        try {
          const timestamp = new Date()
          const signal = await providerRouter.getRoutingSignal(region, timestamp)
          await providerRouter.cacheRoutingSignal(region, signal, timestamp)
          return {
            region,
            status: 'ok' as const,
            carbonIntensity: signal.carbonIntensity,
            confidence: signal.confidence,
            source: signal.provenance.sourceUsed,
          }
        } catch (error) {
          return {
            region,
            status: 'failed' as const,
            error: String(error),
          }
        }
      })
    )

    const succeeded = results.filter(
      (result) => result.status === 'fulfilled' && (result.value as { status: string }).status === 'ok'
    ).length

    console.log(`Cache warming complete: ${succeeded}/${regions.length} regions warmed`)

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const value = result.value as
          | { status: 'ok'; region: string; carbonIntensity: number; confidence: number; source: string | null }
          | { status: 'failed'; region: string; error: string }

        if (value.status === 'ok') {
          console.log(
            `OK ${value.region}: ${value.carbonIntensity} gCO2/kWh (confidence: ${(value.confidence * 100).toFixed(0)}%, source: ${value.source})`
          )
        } else {
          console.log(`FAILED ${value.region}: ${value.error}`)
        }
      } else {
        console.log(`FAILED warm cache: ${String(result.reason)}`)
      }
    }

    return {
      attempted: regions.length,
      succeeded,
      failed: regions.length - succeeded,
      regions,
    }
  } catch (error) {
    console.error('Fatal error during cache warming:', error)
    return {
      attempted: regions.length,
      succeeded: 0,
      failed: regions.length,
      regions,
    }
  }
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
    const redisHealthy = await redis
      .ping()
      .then(() => true)
      .catch(() => false)

    if (!redisHealthy) {
      return {
        isHealthy: false,
        redisConnected: false,
        cacheStats: null,
      }
    }

    const cacheStats = await GridSignalCache.getCacheStats()

    return {
      isHealthy: cacheStats.totalKeys > 0,
      redisConnected: true,
      cacheStats,
    }
  } catch (error) {
    console.error('Error getting cache health status:', error)
    return {
      isHealthy: false,
      redisConnected: false,
      cacheStats: null,
    }
  }
}
