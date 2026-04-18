import { env } from '../../config/env'
import { prisma } from '../db'
import { eia930 } from '../grid-signals/eia-client'
import { redis } from '../redis'
import { validateWaterArtifacts } from '../water/bundle'
import { runtimeBuildInfo } from './build-info'

export async function buildPublicHealthSnapshot() {
  await prisma.$queryRaw`SELECT 1`

  let redisOk = true
  try {
    await redis.ping()
  } catch {
    redisOk = false
  }

  const waterArtifacts = validateWaterArtifacts()
  const ok = waterArtifacts.healthy && redisOk

  return {
    statusCode: ok ? 200 : 503,
    body: {
      status: ok ? 'ok' : 'degraded',
      engine: 'online',
      router: true,
      fingrid: Boolean(env.FINGRID_API_KEY),
      providers: {
        watttime: Boolean(env.WATTTIME_API_KEY || (env.WATTTIME_USERNAME && env.WATTTIME_PASSWORD)),
        gridstatus: Boolean(env.GRIDSTATUS_API_KEY),
        eia930: eia930.isAvailable,
        ember: Boolean(env.EMBER_API_KEY),
        gbCarbon: true,
        dkCarbon: true,
        fiCarbon: Boolean(env.FINGRID_API_KEY),
        onCarbon: Boolean(env.ON_CARBON_FUEL_MIX_JSON || env.ON_CARBON_INTENSITY_G_PER_KWH != null),
        qcCarbon: Boolean(env.QC_CARBON_FUEL_MIX_JSON || env.QC_CARBON_INTENSITY_G_PER_KWH != null),
        bcCarbon: Boolean(env.BC_CARBON_FUEL_MIX_JSON || env.BC_CARBON_INTENSITY_G_PER_KWH != null),
        static: true,
      },
      providerModes: {
        eia930: eia930.mode,
      },
      build: runtimeBuildInfo,
      timestamp: new Date().toISOString(),
      checks: {
        database: true,
        redis: redisOk,
        waterArtifacts: waterArtifacts.checks,
      },
      dependencies: {
        database: true,
        redis: redisOk,
      },
      waterArtifactErrors: waterArtifacts.errors,
    },
  }
}
