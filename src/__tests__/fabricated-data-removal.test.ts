import express from 'express'
import request from 'supertest'

jest.mock('../lib/db', () => ({
  prisma: {
    carbonForecast: {
      findMany: jest.fn(),
    },
    dashboardRoutingDecision: {
      findMany: jest.fn(),
    },
  },
}))

jest.mock('../services/fingard-control', () => ({
  fingard: {
    getNormalizedSignal: jest.fn(),
  },
}))

import createApp from '../app'
import intelligenceRoutes from '../routes/intelligence'
import dashboardApiRoutes from '../routes/dashboard-api'
import metricsRoutes from '../routes/metrics'
import { prisma } from '../lib/db'
import { fingard } from '../services/fingard-control'

const mockedPrisma = prisma as unknown as {
  carbonForecast: { findMany: jest.Mock }
  dashboardRoutingDecision: { findMany: jest.Mock }
}
const mockedFingard = fingard as unknown as {
  getNormalizedSignal: jest.Mock
}

function buildApp(path: string, router: express.Router) {
  const app = express()
  app.use(express.json())
  app.use(path, router)
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }))
  return app
}

describe('fabricated-data removal', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 404 for removed route mounts', async () => {
    const app = createApp()

    for (const [method, path] of [
      ['post', '/api/v1/dashboard/demo-seed'],
      ['post', '/api/v1/route-simple'],
      ['post', '/api/v1/route-test'],
      ['get', '/api/v1/simple-test'],
      ['post', '/api/v1/simple-test'],
      ['post', '/api/v1/test-post'],
      ['post', '/api/v1/route-debug'],
      ['get', '/api/v1/patterns/weekly'],
    ] as const) {
      const response = await request(app)[method](path)
      expect(response.status).toBe(404)
    }
  })

  it('degrades honestly when no best-window forecast rows exist', async () => {
    mockedPrisma.carbonForecast.findMany.mockResolvedValue([])

    const response = await request(buildApp('/api/v1/intelligence', intelligenceRoutes))
      .post('/api/v1/intelligence/best-window')
      .send({ region: 'us-east-1', lookAheadHours: 24 })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      region: 'us-east-1',
      bestWindow: null,
      topWindows: [],
      worstWindow: null,
      currentIntensity: null,
      potentialSavingsPct: null,
      source: null,
      windows: [],
      degraded: true,
      reason: 'no_forecast_data',
    })
    expect(response.body).not.toHaveProperty('confidence')
  })

  it('does not serve an invented current signal when providers fail', async () => {
    mockedFingard.getNormalizedSignal.mockRejectedValue(new Error('provider unavailable'))

    const response = await request(buildApp('/api/v1/dashboard', dashboardApiRoutes))
      .get('/api/v1/dashboard/regions/EU-DE/current')

    expect(response.status).toBe(503)
    expect(response.body).toMatchObject({
      region: 'EU-DE',
      carbonIntensity: null,
      confidence: null,
      source: null,
      degraded: true,
      reason: 'provider_unavailable',
    })
  })

  it('reports provider health and forecast refresh as unavailable when unmeasured', async () => {
    mockedPrisma.dashboardRoutingDecision.findMany.mockResolvedValue([])

    const response = await request(buildApp('/api/v1/metrics', metricsRoutes))
      .get('/api/v1/metrics')

    expect(response.status).toBe(200)
    expect(response.body.watttimeSuccessRate).toBeNull()
    expect(response.body.watttime).toMatchObject({
      successRate: null,
      successCount: null,
      failureCount: null,
      lastSuccessAt: null,
    })
    expect(response.body.forecastRefresh.lastRun).toBeNull()
  })
})
