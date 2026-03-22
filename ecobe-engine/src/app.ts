import express from 'express'
import cors from 'cors'

import { prisma } from './lib/db'
import { redis } from './lib/redis'
import internalRoutes from './routes/internal'
import ciRoutes from './routes/ci'
import dashboardRoutes from './routes/dashboard'
import forecastingRoutes from './routes/forecasting'
import methodologyRoutes from './routes/methodology'
import routeRoutes from './routes/route'
import routingRoutes from './routes/routing'
import carbonCommandRoutes from './routes/carbon-command'
import energyRoutes from './routes/energy'
import intelligenceRoutes from './routes/intelligence'
import gridIntelligenceRoutes from './routes/intelligence/grid'
import dekesRoutes from './routes/dekes'
import dekesHandoffRoutes from './routes/dekes-handoff'
import organizationsRoutes from './routes/organizations'
import decisionsRoutes from './routes/decisions'
import systemRoutes from './routes/system'
import creditsRoutes from './routes/credits'
import carbonLedgerRoutes from './routes/carbon-ledger'
import integrationsRoutes from './routes/integrations'
import routeSimpleRoutes from './routes/route-simple'
import routeTestRoutes from './routes/route-test'
import simpleTestRoutes from './routes/simple-test'
import healthRoutes from './routes/health'
import metricsRoutes from './routes/metrics'
import regionMappingRoutes from './routes/region-mapping'
import patternsRoutes from './routes/patterns'
import dksRoutes from './routes/dks'
import testPostRoutes from './routes/test-post'
import routeDebugRoutes from './routes/route-debug'
import { env } from './config/env'

function attachHealthRoutes(app: express.Express) {
  async function healthHandler(_req: express.Request, res: express.Response) {
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
        fingrid: Boolean(env.FINGRID_API_KEY),
        providers: {
          watttime: Boolean(env.WATTTIME_USERNAME && env.WATTTIME_PASSWORD),
          gridstatus: Boolean(env.GRIDSTATUS_API_KEY || env.EIA_API_KEY),
          ember: Boolean(env.EMBER_API_KEY),
          gbCarbon: true,
          dkCarbon: true,
          fiCarbon: Boolean(env.FINGRID_API_KEY),
          static: true
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
  }

  app.get('/health', healthHandler)
  app.get('/ready', healthHandler)
}

function attachFallbackHandlers(app: express.Express) {
  app.use((req, res) => {
    res.status(404).json({ error: `Not found: ${req.path}` })
  })

  app.use((err: unknown, _req: express.Request, res: express.Response) => {
    console.error('Engine server error:', err)
    res.status(500).json({ error: 'Internal server error' })
  })
}

export function createApp() {
  const app = express()

  app.set('trust proxy', 1)
  app.use(cors())
  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: true, limit: '1mb' }))

  attachHealthRoutes(app)
  app.use('/internal/v1', internalRoutes)
  app.use('/api/v1/ci', ciRoutes)
  app.use('/api/v1/dashboard', dashboardRoutes)
  app.use('/api/v1/forecasting', forecastingRoutes)
  app.use('/api/v1/methodology', methodologyRoutes)
  // Core routing — order matters: carbon-command and routing extend /route
  app.use('/api/v1/route', routeRoutes)
  app.use('/api/v1/route', routingRoutes)
  app.use('/api/v1/route', carbonCommandRoutes)
  // Energy equation
  app.use('/api/v1/energy', energyRoutes)
  // Grid intelligence (specific path before general intelligence)
  app.use('/api/v1/intelligence/grid', gridIntelligenceRoutes)
  app.use('/api/v1/intelligence', intelligenceRoutes)
  // DEKES integration
  app.use('/api/v1/dekes', dekesRoutes)
  app.use('/api/v1/integrations/dekes', dekesHandoffRoutes)
  // Admin / management
  app.use('/api/v1/organizations', organizationsRoutes)
  app.use('/api/v1/decisions', decisionsRoutes)
  app.use('/api/v1/system', systemRoutes)
  app.use('/api/v1/credits', creditsRoutes)
  app.use('/api/v1/carbon-ledger', carbonLedgerRoutes)
  app.use('/api/v1/integrations', integrationsRoutes)
  // Legacy / test routes
  app.use('/api/v1/route-simple', routeSimpleRoutes)
  app.use('/api/v1/route-test', routeTestRoutes)
  app.use('/api/v1/simple-test', simpleTestRoutes)
  app.use('/api/v1/health', healthRoutes)
  app.use('/api/v1/dashboard/metrics', metricsRoutes)
  app.use('/api/v1/dashboard/region-mapping', regionMappingRoutes)
  app.use('/api/v1/patterns', patternsRoutes)
  app.use('/api/v1/integrations/dks', dksRoutes)
  app.use('/api/v1/test-post', testPostRoutes)
  app.use('/api/v1/route-debug', routeDebugRoutes)
  attachFallbackHandlers(app)

  return app
}

export default createApp
