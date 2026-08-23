import express from 'express'
import request from 'supertest'

jest.mock('../config/env', () => ({
  env: {
    ECOBE_INTERNAL_API_KEY: 'test-internal-key',
  },
}))

jest.mock('../lib/db', () => ({
  prisma: {
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  },
}))

jest.mock('../lib/redis', () => ({
  redis: {
    ping: jest.fn().mockResolvedValue('PONG'),
  },
}))

jest.mock('../lib/green-routing', () => ({
  routeGreen: jest.fn(),
}))

import internalRoutes from '../routes/internal'

describe('private internal engine surface', () => {
  function buildApp() {
    const app = express()
    app.use(express.json())
    app.use('/internal/v1', internalRoutes)
    return app
  }

  it('rejects unauthenticated callers', async () => {
    const response = await request(buildApp()).get('/internal/v1/health')

    expect(response.status).toBe(401)
    expect(response.body.code).toBe('UNAUTHORIZED_INTERNAL_CALL')
  })

  it('rejects callers presenting the wrong internal key', async () => {
    const response = await request(buildApp())
      .get('/internal/v1/health')
      .set('authorization', 'Bearer wrong-key')

    expect(response.status).toBe(401)
    expect(response.body.code).toBe('UNAUTHORIZED_INTERNAL_CALL')
  })

  it('serves the health probe to the trusted internal caller', async () => {
    const response = await request(buildApp())
      .get('/internal/v1/health')
      .set('authorization', 'Bearer test-internal-key')

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('healthy')
    expect(response.body.dependencies).toEqual({ database: true, redis: true })
  })

  it('accepts the x-ecobe-internal-key header form', async () => {
    const response = await request(buildApp())
      .get('/internal/v1/health')
      .set('x-ecobe-internal-key', 'test-internal-key')

    expect(response.status).toBe(200)
  })

  it('guards the routing-decision surface, not just health', async () => {
    const response = await request(buildApp())
      .post('/internal/v1/routing-decisions')
      .send({ runId: 'run_1', orgId: 'org_1', projectId: 'proj_1' })

    expect(response.status).toBe(401)
    expect(response.body.code).toBe('UNAUTHORIZED_INTERNAL_CALL')
  })

  it('validates the routing-decision payload for authenticated callers', async () => {
    const response = await request(buildApp())
      .post('/internal/v1/routing-decisions')
      .set('authorization', 'Bearer test-internal-key')
      .send({ runId: '', orgId: 'org_1', projectId: 'proj_1' })

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Invalid engine routing request')
  })
})
