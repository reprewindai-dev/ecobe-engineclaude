/**
 * Tests for src/workers/intelligence-scheduler.ts
 *
 * Key change from env.ts PR refactor:
 * - QSTASH_BASE_URL no longer has a complex regional fallback chain
 *   (EU_CENTRAL_1_QSTASH_URL, US_EAST_1_QSTASH_URL, QSTASH_URL, QSTASH_REGION).
 * - env.QSTASH_BASE_URL is now either undefined or the direct QSTASH_BASE_URL value.
 * - intelligence-scheduler.ts uses `env.QSTASH_BASE_URL ?? 'https://qstash.upstash.io'`
 *   for the resolved base URL.
 */

jest.mock('../lib/db')
jest.mock('../lib/redis', () => ({
  redis: {
    hget: jest.fn().mockResolvedValue(null),
    hgetall: jest.fn().mockResolvedValue({}),
    multi: jest.fn().mockReturnValue({
      hset: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    }),
  },
}))
jest.mock('@upstash/qstash', () => ({
  Client: jest.fn().mockImplementation(() => ({
    publishJSON: jest.fn().mockResolvedValue({ messageId: 'mock-id' }),
  })),
}))
jest.mock('../lib/integration-metrics', () => ({
  recordIntegrationSuccess: jest.fn().mockResolvedValue(undefined),
  recordIntegrationFailure: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('../routes/system', () => ({
  setWorkerStatus: jest.fn(),
}))

const originalEnv = { ...process.env }

beforeEach(() => {
  jest.clearAllMocks()
  // Reset relevant env vars
  delete process.env.QSTASH_TOKEN
  delete process.env.QSTASH_BASE_URL
  delete process.env.ECOBE_ENGINE_URL
})

afterEach(() => {
  if (originalEnv.QSTASH_TOKEN !== undefined) {
    process.env.QSTASH_TOKEN = originalEnv.QSTASH_TOKEN
  } else {
    delete process.env.QSTASH_TOKEN
  }
  if (originalEnv.QSTASH_BASE_URL !== undefined) {
    process.env.QSTASH_BASE_URL = originalEnv.QSTASH_BASE_URL
  } else {
    delete process.env.QSTASH_BASE_URL
  }
  if (originalEnv.ECOBE_ENGINE_URL !== undefined) {
    process.env.ECOBE_ENGINE_URL = originalEnv.ECOBE_ENGINE_URL
  } else {
    delete process.env.ECOBE_ENGINE_URL
  }
  jest.resetModules()
})

describe('scheduleIntelligenceJobs', () => {
  describe('early return conditions', () => {
    it('skips scheduling when QSTASH_TOKEN is not set', async () => {
      delete process.env.QSTASH_TOKEN
      process.env.ECOBE_ENGINE_URL = 'https://engine.example.com'

      const { setWorkerStatus } = require('../routes/system')
      const { scheduleIntelligenceJobs } = await import('../workers/intelligence-scheduler')

      await scheduleIntelligenceJobs()

      expect(setWorkerStatus).toHaveBeenCalledWith(
        'intelligenceJobs',
        expect.objectContaining({ running: false })
      )
    })

    it('skips scheduling when ECOBE_ENGINE_URL is not set', async () => {
      process.env.QSTASH_TOKEN = 'qstash-test-token'
      delete process.env.ECOBE_ENGINE_URL

      const { setWorkerStatus } = require('../routes/system')
      const { scheduleIntelligenceJobs } = await import('../workers/intelligence-scheduler')

      await scheduleIntelligenceJobs()

      expect(setWorkerStatus).toHaveBeenCalledWith(
        'intelligenceJobs',
        expect.objectContaining({ running: false })
      )
    })

    it('skips scheduling when both QSTASH_TOKEN and ECOBE_ENGINE_URL are missing', async () => {
      delete process.env.QSTASH_TOKEN
      delete process.env.ECOBE_ENGINE_URL

      const { setWorkerStatus } = require('../routes/system')
      const { scheduleIntelligenceJobs } = await import('../workers/intelligence-scheduler')

      await scheduleIntelligenceJobs()

      expect(setWorkerStatus).toHaveBeenCalledWith(
        'intelligenceJobs',
        expect.objectContaining({ running: false })
      )
    })
  })

  describe('with required env vars set', () => {
    beforeEach(() => {
      process.env.QSTASH_TOKEN = 'qstash-test-token'
      process.env.ECOBE_ENGINE_URL = 'https://engine.example.com'
    })

    it('sets worker status to running after scheduling', async () => {
      const { setWorkerStatus } = require('../routes/system')
      const { scheduleIntelligenceJobs } = await import('../workers/intelligence-scheduler')

      await scheduleIntelligenceJobs()

      expect(setWorkerStatus).toHaveBeenCalledWith(
        'intelligenceJobs',
        expect.objectContaining({ running: true })
      )
    })

    it('skips publishing when redis cache hit matches signature', async () => {
      const { redis } = require('../lib/redis')
      // Mock cache hit: cached signature matches job signature
      // The signature is `${job.cron}|${destination}`
      const expectedDestination = 'https://engine.example.com/api/v1/intelligence/jobs/accuracy'
      redis.hget.mockResolvedValue(`*/30 * * * *|${expectedDestination}`)

      const { Client } = require('@upstash/qstash')
      const { scheduleIntelligenceJobs } = await import('../workers/intelligence-scheduler')

      await scheduleIntelligenceJobs()

      // publishJSON should not have been called for the cached job
      const mockInstance = Client.mock.instances[0]
      if (mockInstance) {
        expect(mockInstance.publishJSON).not.toHaveBeenCalledWith(
          expect.objectContaining({ url: expectedDestination })
        )
      }
    })
  })

  describe('getScheduledIntelligenceJobs', () => {
    it('returns empty array when redis has no entries', async () => {
      const { redis } = require('../lib/redis')
      redis.hgetall.mockResolvedValue(null)

      const { getScheduledIntelligenceJobs } = await import('../workers/intelligence-scheduler')
      const result = await getScheduledIntelligenceJobs()

      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(0)
    })

    it('parses and returns job metadata from redis', async () => {
      const { redis } = require('../lib/redis')
      const jobMeta = {
        job: 'intelligence-accuracy',
        cron: '*/30 * * * *',
        destination: 'https://engine.example.com/api/v1/intelligence/jobs/accuracy',
        qstashBaseUrl: 'https://qstash.upstash.io',
        lastScheduledAt: '2026-01-01T00:00:00.000Z',
      }
      redis.hgetall.mockResolvedValue({
        'intelligence-accuracy': JSON.stringify(jobMeta),
      })

      const { getScheduledIntelligenceJobs } = await import('../workers/intelligence-scheduler')
      const result = await getScheduledIntelligenceJobs()

      expect(result).toHaveLength(1)
      expect(result[0].job).toBe('intelligence-accuracy')
      expect(result[0].cron).toBe('*/30 * * * *')
    })

    it('filters out unparseable entries', async () => {
      const { redis } = require('../lib/redis')
      redis.hgetall.mockResolvedValue({
        'bad-entry': 'not-valid-json',
        'good-entry': JSON.stringify({
          job: 'intelligence-accuracy',
          cron: '*/30 * * * *',
          destination: 'https://engine.example.com/api/v1/intelligence/jobs/accuracy',
          qstashBaseUrl: 'https://qstash.upstash.io',
          lastScheduledAt: '2026-01-01T00:00:00.000Z',
        }),
      })

      const { getScheduledIntelligenceJobs } = await import('../workers/intelligence-scheduler')
      const result = await getScheduledIntelligenceJobs()

      expect(result).toHaveLength(1)
      expect(result[0].job).toBe('intelligence-accuracy')
    })

    it('sorts results by lastScheduledAt descending', async () => {
      const { redis } = require('../lib/redis')
      redis.hgetall.mockResolvedValue({
        'job-older': JSON.stringify({
          job: 'job-older',
          cron: '*/15 * * * *',
          destination: 'https://engine.example.com/api/v1/jobs/older',
          qstashBaseUrl: 'https://qstash.upstash.io',
          lastScheduledAt: '2026-01-01T00:00:00.000Z',
        }),
        'job-newer': JSON.stringify({
          job: 'job-newer',
          cron: '*/30 * * * *',
          destination: 'https://engine.example.com/api/v1/jobs/newer',
          qstashBaseUrl: 'https://qstash.upstash.io',
          lastScheduledAt: '2026-04-01T00:00:00.000Z',
        }),
      })

      const { getScheduledIntelligenceJobs } = await import('../workers/intelligence-scheduler')
      const result = await getScheduledIntelligenceJobs()

      expect(result).toHaveLength(2)
      expect(result[0].job).toBe('job-newer')
      expect(result[1].job).toBe('job-older')
    })
  })
})

describe('QSTASH_BASE_URL env resolution (simplified — no regional fallback)', () => {
  /**
   * In this PR, the regional QSTASH fallback was removed from env.ts.
   * Previously, QSTASH_BASE_URL fell back through:
   *   QSTASH_BASE_URL ?? QSTASH_URL ?? (QSTASH_REGION based) ?? EU_CENTRAL_1_QSTASH_URL ?? US_EAST_1_QSTASH_URL ?? default
   *
   * Now it is just: QSTASH_BASE_URL (undefined if not set)
   * The intelligence-scheduler.ts then uses: env.QSTASH_BASE_URL ?? 'https://qstash.upstash.io'
   */
  it('env.QSTASH_BASE_URL is undefined in test environment without the env var', () => {
    const { env } = require('../config/env')
    if (!process.env.QSTASH_BASE_URL) {
      expect(env.QSTASH_BASE_URL).toBeUndefined()
    }
  })

  it('env.QSTASH_BASE_URL is not set to old fallback URL by default', () => {
    const { env } = require('../config/env')
    if (!process.env.QSTASH_BASE_URL) {
      expect(env.QSTASH_BASE_URL).not.toBe('https://qstash.upstash.io')
    }
  })

  it('env.QSTASH_TOKEN is undefined in test environment without the env var', () => {
    const { env } = require('../config/env')
    if (!process.env.QSTASH_TOKEN) {
      expect(env.QSTASH_TOKEN).toBeUndefined()
    }
  })
})