export {}

process.env.ECOBE_INTERNAL_API_KEY = 'test-internal-key'

jest.mock('../lib/cache-warmer', () => ({
  warmCacheOnStartup: jest.fn(),
  getCacheHealthStatus: jest.fn(),
}))

jest.mock('../workers/forecast-poller', () => ({
  runForecastRefresh: jest.fn(),
}))

jest.mock('../workers/forecast-verification', () => ({
  runForecastVerification: jest.fn(),
}))

jest.mock('../workers/eia-ingestion', () => ({
  runEIAIngestionOnce: jest.fn(),
}))

jest.mock('../routes/system', () => ({
  getWorkerStatus: jest.fn(() => ({
    forecastPoller: { running: true, lastRun: '2026-03-23T00:00:00.000Z', nextRun: null, activeRunId: null },
    eiaIngestion: { running: false, lastRun: null, nextRun: null, activeRunId: null },
    intelligenceJobs: { running: false, lastRun: null, nextRun: null, activeRunId: null },
  })),
}))

jest.mock('../lib/db', () => ({
  prisma: {
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  },
}))

jest.mock('../lib/redis', () => ({
  redis: {
    ping: jest.fn().mockResolvedValue('PONG'),
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
  },
}))

const express = require('express')
const request = require('supertest')
const { TaskAlreadyRunningError } = require('../lib/task-lock')
const { warmCacheOnStartup, getCacheHealthStatus } = require('../lib/cache-warmer')
const { runForecastRefresh } = require('../workers/forecast-poller')
const { runForecastVerification } = require('../workers/forecast-verification')
const { runEIAIngestionOnce } = require('../workers/eia-ingestion')
const automationRoutes = require('../routes/automation').default

describe('automation hardening', () => {
  let app: any

  beforeEach(() => {
    jest.clearAllMocks()
    app = express()
    app.use(express.json())
    app.use('/api/v1', automationRoutes)
  })

  it('requires internal auth for maintenance triggers', async () => {
    const response = await request(app).post('/api/v1/ingest/eia').send({})
    expect(response.status).toBe(401)
  })

  it('returns 202 already_running when refresh overlaps', async () => {
    runForecastRefresh.mockRejectedValue(new TaskAlreadyRunningError('forecast_refresh', 'run-123'))

    const response = await request(app)
      .post('/api/v1/forecast/refresh')
      .set('Authorization', 'Bearer test-internal-key')
      .send({})

    expect(response.status).toBe(202)
    expect(response.body.status).toBe('already_running')
    expect(response.body.runId).toBe('run-123')
  })

  it('reports degraded health when cache health is false', async () => {
    getCacheHealthStatus.mockResolvedValue({
      isHealthy: false,
      redisConnected: true,
      cacheStats: {
        totalKeys: 12,
        keyTypes: { hash: 12 },
        regions: { 'us-east-1': 6, 'eu-west-1': 6 },
      },
    })

    const response = await request(app)
      .get('/api/v1/automation/health')
      .set('Authorization', 'Bearer test-internal-key')

    expect(response.status).toBe(503)
    expect(response.body.status).toBe('degraded')
    expect(response.body.checks.cache).toBe(false)
  })

  it('triggers explicit maintenance endpoints when authorized', async () => {
    runEIAIngestionOnce.mockResolvedValue({
      startedAt: '2026-03-23T00:00:00.000Z',
      finishedAt: '2026-03-23T00:01:00.000Z',
      successCount: 4,
      failureCount: 0,
      dataSource: 'gridstatus',
    })
    runForecastVerification.mockResolvedValue({
      startedAt: '2026-03-23T00:00:00.000Z',
      finishedAt: '2026-03-23T00:03:00.000Z',
      checked: 10,
      withinTarget: 9,
      withinTargetPct: 90,
    })
    warmCacheOnStartup.mockResolvedValue({
      attempted: 2,
      succeeded: 2,
      failed: 0,
      regions: ['us-east-1', 'eu-west-1'],
    })

    const headers = { Authorization: 'Bearer test-internal-key' }
    const ingest = await request(app).post('/api/v1/ingest/eia').set(headers).send({})
    const verify = await request(app).post('/api/v1/verification/run').set(headers).send({ lookbackHours: 12 })
    const warm = await request(app).post('/api/v1/cache/warm').set(headers).send({ regions: ['us-east-1', 'eu-west-1'] })

    expect(ingest.status).toBe(200)
    expect(verify.status).toBe(200)
    expect(warm.status).toBe(200)
    expect(warm.body.task).toBe('cache_warm')
  })
})
