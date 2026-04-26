import express from 'express'
import request from 'supertest'

function createRouterMock() {
  const express = require('express') as typeof import('express')
  return express.Router()
}

jest.mock('../config/env', () => ({
  env: {
    ECOBE_INTERNAL_API_KEY: 'test-internal-key',
  },
}))

jest.mock('../lib/db', () => ({
  prisma: {
    decisionTraceEnvelope: {
      count: jest.fn(async () => 0),
    },
  },
}))

jest.mock('../lib/redis', () => ({
  redis: {
    ping: jest.fn(async () => 'PONG'),
  },
}))

jest.mock('../routes/organizations', () => {
  const express = require('express') as typeof import('express')
  return express.Router()
})

jest.mock('../lib/organizations', () => ({
  provisionOrganization: jest.fn(),
  rotateOrganizationApiKey: jest.fn(),
  getOrganizationUsageSummary: jest.fn(),
  OrganizationError: class OrganizationError extends Error {},
}))

jest.mock('../routes/energy', () => createRouterMock())
jest.mock('../routes/dekes', () => createRouterMock())
jest.mock('../routes/routing', () => createRouterMock())
jest.mock('../routes/credits', () => createRouterMock())
jest.mock('../routes/decisions', () => createRouterMock())
jest.mock('../routes/dashboard', () => createRouterMock())
jest.mock('../routes/dashboard-api', () => createRouterMock())
jest.mock('../routes/forecasting', () => createRouterMock())
jest.mock('../routes/carbon-command', () => createRouterMock())
jest.mock('../routes/intelligence', () => createRouterMock())
jest.mock('../routes/intelligence/grid', () => createRouterMock())
jest.mock('../routes/integrations', () => createRouterMock())
jest.mock('../routes/system', () => createRouterMock())
jest.mock('../routes/dekes-handoff', () => createRouterMock())
jest.mock('../routes/carbon-ledger', () => createRouterMock())
jest.mock('../routes/route-simple', () => createRouterMock())
jest.mock('../routes/route-test', () => createRouterMock())
jest.mock('../routes/simple-test', () => createRouterMock())
jest.mock('../routes/health', () => createRouterMock())
jest.mock('../routes/metrics', () => createRouterMock())
jest.mock('../routes/region-mapping', () => createRouterMock())
jest.mock('../routes/patterns', () => createRouterMock())
jest.mock('../routes/dks', () => createRouterMock())
jest.mock('../routes/test-post', () => createRouterMock())
jest.mock('../routes/route-debug', () => createRouterMock())
jest.mock('../routes/ci', () => createRouterMock())
jest.mock('../routes/water', () => createRouterMock())
jest.mock('../routes/events', () => createRouterMock())
jest.mock('../routes/adapters', () => createRouterMock())
jest.mock('../routes/internal-policy', () => createRouterMock())
jest.mock('../routes/doctrine', () => createRouterMock())

jest.mock('../lib/observability/telemetry', () => ({
  recordTelemetryMetric: jest.fn(),
  telemetryMetricNames: [],
}))

jest.mock('../lib/water/bundle', () => ({
  validateWaterArtifacts: jest.fn(() => ({
    healthy: true,
    checks: {},
    errors: [],
  })),
}))

jest.mock('../services/health.service', () => ({
  buildHealthSnapshot: jest.fn(async () => ({
    engineStatus: 'operational',
    policyEngineLoaded: true,
    carbonSignalSource: 'sandbox-mock',
    tierGatingActive: true,
    privateBoundaryConfigured: true,
    totalDecisionsServed: 0,
    uptime: 0,
    database: true,
    redis: true,
  })),
}))

import createApp from '../app'
import { internalServiceGuard } from '../middleware/internal-auth'

describe('private-by-contract internal service guard', () => {
  function buildApp() {
    const app = express()
    app.use(express.json())
    app.get('/health', (_req, res) => res.json({ ok: true }))
    app.use('/evaluate', internalServiceGuard, (_req, res) => res.json({ ok: true }))
    app.use('/api/v1', internalServiceGuard)
    app.get('/api/v1/private', (_req, res) => res.json({ ok: true }))
    app.post('/api/v1/decision', (_req, res) => res.json({ ok: true }))
    return app
  }

  it('rejects direct callers without an internal key', async () => {
    const app = buildApp()

    const response = await request(app).get('/api/v1/private')

    expect(response.status).toBe(401)
    expect(response.body.code).toBe('UNAUTHORIZED_INTERNAL_CALL')
  })

  it('allows callers with the internal key', async () => {
    const app = buildApp()

    const response = await request(app)
      .get('/api/v1/private')
      .set('authorization', 'Bearer test-internal-key')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })
  })

  it('keeps health endpoints reachable without broker auth', async () => {
    const app = buildApp()

    const response = await request(app).get('/health')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })
  })

  it('requires the trusted broker for the internal health surface', async () => {
    const app = createApp()

    const unauthenticated = await request(app).get('/api/v1/internal/health')

    expect(unauthenticated.status).toBe(401)
    expect(unauthenticated.body.code).toBe('UNAUTHORIZED_INTERNAL_CALL')
  })

  it('rejects decision and evaluate surfaces without internal auth', async () => {
    const app = buildApp()

    const decisionResponse = await request(app).post('/api/v1/decision')
    const evaluateResponse = await request(app).post('/evaluate')

    expect(decisionResponse.status).toBe(401)
    expect(decisionResponse.body.code).toBe('UNAUTHORIZED_INTERNAL_CALL')
    expect(evaluateResponse.status).toBe(401)
    expect(evaluateResponse.body.code).toBe('UNAUTHORIZED_INTERNAL_CALL')
  })

  it('allows callers with the internal key on decision and evaluate surfaces', async () => {
    const app = buildApp()

    const headers = {
      authorization: 'Bearer test-internal-key',
    }

    const decisionResponse = await request(app).post('/api/v1/decision').set(headers)
    const evaluateResponse = await request(app).post('/evaluate').set(headers)

    expect(decisionResponse.status).toBe(200)
    expect(decisionResponse.body).toEqual({ ok: true })
    expect(evaluateResponse.status).toBe(200)
    expect(evaluateResponse.body).toEqual({ ok: true })
  })
})
