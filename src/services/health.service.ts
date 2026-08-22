import { prisma } from '../lib/db'
import { redis } from '../lib/redis'
import { env } from '../config/env'

export type CarbonSignalSource = 'watttime' | 'electricitymaps' | 'sandbox-mock'

export async function buildHealthSnapshot() {
  let redisOk = true

  try {
    await redis.ping()
  } catch {
    redisOk = false
  }

  const totalDecisionsServed = await prisma.decisionTraceEnvelope.count()
  const carbonSignalSource: CarbonSignalSource = env.ELECTRICITY_MAPS_API_KEY
    ? 'electricitymaps'
    : env.WATTTIME_USERNAME || env.WATTTIME_PASSWORD || env.WATTTIME_API_KEY
      ? 'watttime'
      : 'sandbox-mock'
  const privateBoundaryConfigured = Boolean(env.ECOBE_INTERNAL_API_KEY)

  return {
    engineStatus: 'operational' as const,
    policyEngineLoaded: true,
    carbonSignalSource,
    tierGatingActive: true,
    privateBoundaryConfigured,
    totalDecisionsServed,
    uptime: Math.round(process.uptime()),
    database: true,
    redis: redisOk,
  }
}
