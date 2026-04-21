import express from 'express'
import request from 'supertest'

import { brokerSurfaceGuard } from '../middleware/internal-auth'

describe('private-by-contract broker guard', () => {
  function buildApp() {
    const app = express()
    app.use(express.json())
    app.get('/health', (_req, res) => res.json({ ok: true }))
    app.use('/evaluate', brokerSurfaceGuard, (_req, res) => res.json({ ok: true }))
    app.use('/api/v1', brokerSurfaceGuard)
    app.get('/api/v1/private', (_req, res) => res.json({ ok: true }))
    app.get('/api/v1/internal/health', brokerSurfaceGuard, (_req, res) => res.json({ ok: true }))
    app.post('/api/v1/decision', (_req, res) => res.json({ ok: true }))
    return app
  }

  it('rejects direct callers without a trusted broker identity', async () => {
    const app = buildApp()

    const response = await request(app).get('/api/v1/private')

    expect(response.status).toBe(401)
    expect(response.body.code).toBe('MISSING_TRUSTED_BROKER_ID')
  })

  it('rejects untrusted broker identities', async () => {
    const app = buildApp()

    const response = await request(app)
      .get('/api/v1/private')
      .set('x-ecobe-broker-id', 'public-site')
      .set('authorization', 'Bearer test-internal-key')

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('UNTRUSTED_BROKER_CALL')
  })

  it('allows only the trusted broker with the internal key', async () => {
    const app = buildApp()

    const response = await request(app)
      .get('/api/v1/private')
      .set('x-ecobe-broker-id', 'ecobe-mvp')
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
    const app = buildApp()

    const unauthenticated = await request(app).get('/api/v1/internal/health')
    const authenticated = await request(app)
      .get('/api/v1/internal/health')
      .set('x-ecobe-broker-id', 'ecobe-mvp')
      .set('authorization', 'Bearer test-internal-key')

    expect(unauthenticated.status).toBe(401)
    expect(unauthenticated.body.code).toBe('MISSING_TRUSTED_BROKER_ID')
    expect(authenticated.status).toBe(200)
    expect(authenticated.body).toEqual({ ok: true })
  })

  it('rejects decision and evaluate surfaces without broker auth', async () => {
    const app = buildApp()

    const decisionResponse = await request(app).post('/api/v1/decision')
    const evaluateResponse = await request(app).post('/evaluate')

    expect(decisionResponse.status).toBe(401)
    expect(decisionResponse.body.code).toBe('MISSING_TRUSTED_BROKER_ID')
    expect(evaluateResponse.status).toBe(401)
    expect(evaluateResponse.body.code).toBe('MISSING_TRUSTED_BROKER_ID')
  })

  it('allows the trusted broker on decision and evaluate surfaces', async () => {
    const app = buildApp()

    const headers = {
      'x-ecobe-broker-id': 'ecobe-mvp',
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
