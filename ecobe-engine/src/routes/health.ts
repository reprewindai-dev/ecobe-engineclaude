import { Router } from 'express'
import { env } from '../config/env'
import { prisma } from '../lib/db'
import { redis } from '../lib/redis'
import { eia930 } from '../lib/grid-signals/eia-client'

const router = Router()

/**
 * GET /api/v1/health
 * Health check endpoint for dashboard
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

    const ok = redisOk

    res.status(ok ? 200 : 503).json({
      status: ok ? 'ok' : 'degraded',
      engine: 'online',
      router: true,
      fingard: true,
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
        static: true
      },
      providerModes: {
        eia930: eia930.mode,
      },
      timestamp: new Date().toISOString(),
      dependencies: {
        database: true,
        redis: redisOk,
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
