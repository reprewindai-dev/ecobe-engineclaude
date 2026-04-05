import express from 'express'
import request from 'supertest'

const mockRedisPing = jest.fn()
const mockQueryRaw = jest.fn()
const mockDecisionEventCount = jest.fn()
const mockDecisionProjectionCount = jest.fn()
const mockGetCacheStats = jest.fn()
const mockGetCacheHealthStatus = jest.fn()
const mockGetDecisionProjectionFreshness = jest.fn()
const mockGetProviderFreshness = jest.fn()

jest.mock('../lib/redis', () => ({
  redis: {
    ping: (...args: unknown[]) => mockRedisPing(...args),
  },
}))

jest.mock('../lib/db', () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
    decisionEventOutbox: {
      count: (...args: unknown[]) => mockDecisionEventCount(...args),
    },
    decisionProjectionOutbox: {
      count: (...args: unknown[]) => mockDecisionProjectionCount(...args),
    },
  },
}))

jest.mock('../lib/grid-signals/grid-signal-cache', () => ({
  GridSignalCache: {
    getCacheStats: (...args: unknown[]) => mockGetCacheStats(...args),
  },
}))

jest.mock('../lib/cache-warmer', () => ({
  getCacheHealthStatus: (...args: unknown[]) => mockGetCacheHealthStatus(...args),
}))

jest.mock('../lib/ci/decision-projection', () => ({
  getDecisionProjectionFreshness: (...args: unknown[]) => mockGetDecisionProjectionFreshness(...args),
}))

jest.mock('../lib/routing', () => ({
  getProviderFreshness: (...args: unknown[]) => mockGetProviderFreshness(...args),
}))

import systemRouter from '../routes/system'

describe('system status telemetry', () => {
  const app = express()
  app.use('/api/v1/system', systemRouter)

  beforeEach(() => {
    jest.clearAllMocks()
    mockRedisPing.mockResolvedValue('PONG')
    mockQueryRaw.mockResolvedValue([{ '?column?': 1 }])
    mockDecisionEventCount
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(8)
    mockDecisionProjectionCount
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(9)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
    mockGetCacheStats.mockResolvedValue({
      totalKeys: 12,
      keyTypes: { routing: 8, features: 4 },
      l1: { hits: 10, misses: 2 },
      regions: { 'us-east-1': 5, 'eu-west-1': 3 },
    })
    mockGetCacheHealthStatus.mockResolvedValue({
      requiredWarmCoveragePct: 100,
      requiredLkgCoveragePct: 100,
      requiredRegions: ['us-east-1', 'eu-west-1'],
      isHealthy: true,
    })
    mockGetDecisionProjectionFreshness.mockResolvedValue({
      latestProjectionAt: new Date('2026-04-05T12:00:00.000Z'),
      latestCanonicalAt: new Date('2026-04-05T12:05:00.000Z'),
      projectionLagSec: 300,
      dataStatus: 'degraded',
      quality: { suspectCount: 1, invalidCount: 0 },
    })
    mockGetProviderFreshness.mockResolvedValue([
      {
        provider: 'WATTTIME_MOER',
        latestObservedAt: '2026-04-05T11:59:00.000Z',
        freshnessSec: 60,
        isStale: false,
        configured: true,
        status: 'healthy',
        statusReasonCode: 'fresh',
        ttlSec: 900,
        lastError: null,
        lastLatencyMs: 120,
      },
      {
        provider: 'EMBER_STRUCTURAL_BASELINE',
        latestObservedAt: '',
        freshnessSec: -1,
        isStale: true,
        configured: false,
        status: 'offline',
        statusReasonCode: 'missing_config',
        ttlSec: 3600,
        lastError: null,
        lastLatencyMs: null,
      },
    ])
  })

  it('returns first-class provider freshness and projection backlog telemetry', async () => {
    const response = await request(app).get('/api/v1/system/status').expect(200)

    expect(response.body.status).toBe('healthy')
    expect(response.body.cache).toMatchObject({
      healthy: true,
      requiredWarmCoveragePct: 100,
    })
    expect(response.body.decisionProjectionBacklog).toEqual({
      pending: 4,
      processing: 2,
      active: 6,
      failed: 1,
      deadLetter: 0,
    })
    expect(response.body.decisionProjection).toMatchObject({
      projectionLagSec: 300,
      dataStatus: 'degraded',
    })
    expect(response.body.providerFreshness).toEqual({
      healthy: 1,
      degraded: 0,
      offline: 1,
      stale: 1,
      maxFreshnessSec: 60,
      providers: [
        {
          provider: 'WATTTIME_MOER',
          status: 'healthy',
          freshnessSec: 60,
          statusReasonCode: 'fresh',
          lastLatencyMs: 120,
        },
        {
          provider: 'EMBER_STRUCTURAL_BASELINE',
          status: 'offline',
          freshnessSec: -1,
          statusReasonCode: 'missing_config',
          lastLatencyMs: null,
        },
      ],
    })
  })
})
