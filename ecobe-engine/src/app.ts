import express from 'express'

import { prisma } from './lib/db'
import { redis } from './lib/redis'
import internalRoutes from './routes/internal'
import ciRoutes from './routes/ci'
import dashboardRoutes from './routes/dashboard'
import forecastingRoutes from './routes/forecasting'
import methodologyRoutes from './routes/methodology'
import routeRoutes from './routes/route'
import routeSimpleRoutes from './routes/route-simple'
import routeTestRoutes from './routes/route-test'
import simpleTestRoutes from './routes/simple-test'
import healthRoutes from './routes/health'
import metricsRoutes from './routes/metrics'
import regionMappingRoutes from './routes/region-mapping'
import patternsRoutes from './routes/patterns'
import dksRoutes from './routes/dks'
import testPostRoutes from './routes/test-post'

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
        fingard: true,
        providers: {
          watttime: false,
          eia930: true,
          ember: true,
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

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Engine server error:', err)
    res.status(500).json({ error: 'Internal server error' })
  })
}

export function createApp() {
  const app = express()

  app.set('trust proxy', 1)
  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: true, limit: '1mb' }))

  attachHealthRoutes(app)
  app.use('/internal/v1', internalRoutes)
  app.use('/api/v1/ci', ciRoutes)
  app.use('/api/v1/dashboard', dashboardRoutes)
  app.use('/api/v1/forecasting', forecastingRoutes)
  app.use('/api/v1/methodology', methodologyRoutes)
  app.use('/api/v1/route', routeRoutes)
  app.use('/api/v1/route-simple', routeSimpleRoutes)
  app.use('/api/v1/route-test', routeTestRoutes)
  app.use('/api/v1/simple-test', simpleTestRoutes)
  app.use('/api/v1/health', healthRoutes)
  app.use('/api/v1/dashboard/metrics', metricsRoutes)
  app.use('/api/v1/dashboard/region-mapping', regionMappingRoutes)
  app.use('/api/v1/patterns', patternsRoutes)
  app.use('/api/v1/integrations/dks', dksRoutes)
  app.use('/api/v1/test-post', testPostRoutes)
  attachFallbackHandlers(app)

  return app
}

export default createApp
