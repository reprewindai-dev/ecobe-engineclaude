import { prisma } from '../lib/db'
import { redis } from '../lib/redis'
import { env } from '../config/env'

export type CarbonSignalSource = 'watttime' | 'electricitymaps' | 'sandbox-mock'

export async function buildHealthSnapshot() {
  let redisOk = true
  let databaseOk = true
  let totalDecisionsServed = 0

  try {
    await redis.ping()
  } catch {
    redisOk = false
  }

  try {
    totalDecisionsServed = await prisma.decisionTraceEnvelope.count()
  } catch (error) {
    databaseOk = false
    console.error('Failed to read decision count for health snapshot', error)
  }

  const carbonSignalSource: CarbonSignalSource = env.ELECTRICITY_MAPS_API_KEY
    ? 'electricitymaps'
    : (env.WATTTIME_API_KEY || (env.WATTTIME_USERNAME && env.WATTTIME_PASSWORD))
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
    database: databaseOk,
    redis: redisOk,
  }
}
