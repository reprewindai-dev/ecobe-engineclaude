import { Router } from 'express'
import { env } from '../config/env'
import { prisma } from '../lib/db'
import { getIntegrationMetricsSummary, computeIntegrationSuccessRate } from '../lib/integration-metrics'
import { redis, redisDisabled } from '../lib/redis'

const router = Router()

type ProviderConfig = {
  key: string
  source: string
  enabled: boolean
}

type IntegrationMetricRecord = {
  source: string
  successCount: number
  failureCount: number
  lastSuccessAt: Date | null
  lastFailureAt: Date | null
  alertActive: boolean
}

const PROVIDERS: ProviderConfig[] = [
  { key: 'watttime', source: 'WATTTIME', enabled: Boolean(env.WATTTIME_USERNAME && env.WATTTIME_PASSWORD) },
  { key: 'eia930', source: 'EIA_930', enabled: Boolean(env.EIA_API_KEY) },
  { key: 'gridstatus', source: 'GRIDSTATUS', enabled: true },
  { key: 'ember', source: 'EMBER', enabled: true },
  { key: 'gbCarbon', source: 'GB_CARBON', enabled: true },
  { key: 'dkCarbon', source: 'DK_CARBON', enabled: true },
  { key: 'fiCarbon', source: 'FI_CARBON', enabled: Boolean(env.FINGRID_API_KEY) },
  { key: 'ontarioIeso', source: 'ONTARIO_IESO', enabled: true },
  { key: 'quebecHydro', source: 'QUEBEC_HYDRO', enabled: true },
  { key: 'bcGov', source: 'BC_GOV', enabled: true },
  { key: 'electricityMaps', source: 'ELECTRICITY_MAPS', enabled: Boolean(env.ELECTRICITY_MAPS_API_KEY) },
]

function providerState(
  enabled: boolean,
  metric?: IntegrationMetricRecord
): boolean {
  if (!enabled) return false
  if (!metric) return false
  const successRate = computeIntegrationSuccessRate(metric) ?? 0
  const hasSuccess = metric.successCount > 0
  return hasSuccess && !metric.alertActive && successRate >= 0.8
}

/**
 * GET /api/v1/health
 * Health check endpoint for dashboard and deployment verification.
 */
router.get('/', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`

    let redisOk = true
    try {
      await redis.ping()
    } catch {
      redisOk = false
    }

    const metrics = (await getIntegrationMetricsSummary()) as IntegrationMetricRecord[]
    const bySource = new Map<string, IntegrationMetricRecord>(
      metrics.map((metric) => [metric.source, metric])
    )

    const providers = Object.fromEntries(
      PROVIDERS.map((provider) => [
        provider.key,
        providerState(provider.enabled, bySource.get(provider.source)),
      ])
    )

    const degradedProviders = PROVIDERS.filter(
      (provider) => provider.enabled && !providerState(provider.enabled, bySource.get(provider.source))
    ).map((provider) => provider.key)

    const dependencyOk = redisDisabled ? true : redisOk
    const status = dependencyOk ? (degradedProviders.length > 0 ? 'degraded' : 'ok') : 'unhealthy'

    res.status(status === 'unhealthy' ? 503 : 200).json({
      status,
      engine: 'online',
      router: true,
      providers,
      degradedProviders,
      timestamp: new Date().toISOString(),
      checks: {
        database: true,
        redis: redisDisabled ? null : redisOk,
      },
      dependencies: {
        database: true,
        redis: redisDisabled ? null : redisOk,
        redisDisabled,
      },
    })
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

export default router
