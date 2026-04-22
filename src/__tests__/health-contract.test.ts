const mockedEnv = {
  ELECTRICITY_MAPS_API_KEY: undefined as string | undefined,
  WATTTIME_USERNAME: undefined as string | undefined,
  WATTTIME_PASSWORD: undefined as string | undefined,
  WATTTIME_API_KEY: undefined as string | undefined,
  ECOBE_INTERNAL_API_KEY: 'internal-key',
}

jest.mock('../config/env', () => ({
  env: mockedEnv,
}))

jest.mock('../lib/db', () => ({
  prisma: {
    decisionTraceEnvelope: {
      count: jest.fn(async () => 7),
    },
  },
}))

jest.mock('../lib/redis', () => ({
  redis: {
    ping: jest.fn(async () => 'PONG'),
  },
}))

import { prisma } from '../lib/db'
import { redis } from '../lib/redis'
import { buildHealthSnapshot } from '../services/health.service'

describe('health snapshot', () => {
  beforeEach(() => {
    mockedEnv.ELECTRICITY_MAPS_API_KEY = undefined
    mockedEnv.WATTTIME_USERNAME = undefined
    mockedEnv.WATTTIME_PASSWORD = undefined
    mockedEnv.WATTTIME_API_KEY = undefined
    mockedEnv.ECOBE_INTERNAL_API_KEY = 'internal-key'
    jest.restoreAllMocks()
  })

  it('returns the operational engine health fields', async () => {
    const snapshot = await buildHealthSnapshot()

    expect(snapshot.engineStatus).toBe('operational')
    expect(snapshot.policyEngineLoaded).toBe(true)
    expect(snapshot.carbonSignalSource).toBe('sandbox-mock')
    expect(snapshot.tierGatingActive).toBe(true)
    expect(snapshot.privateBoundaryConfigured).toBe(true)
    expect(snapshot.totalDecisionsServed).toBe(7)
    expect(snapshot.database).toBe(true)
    expect(snapshot.redis).toBe(true)
    expect(typeof snapshot.uptime).toBe('number')
  })

  it('detects electricity maps as the carbon signal source', async () => {
    mockedEnv.ELECTRICITY_MAPS_API_KEY = 'electricitymaps-key'

    const snapshot = await buildHealthSnapshot()

    expect(snapshot.carbonSignalSource).toBe('electricitymaps')
  })

  it('detects watttime from username/password credentials', async () => {
    mockedEnv.WATTTIME_USERNAME = 'wt-user'
    mockedEnv.WATTTIME_PASSWORD = 'wt-pass'

    const snapshot = await buildHealthSnapshot()

    expect(snapshot.carbonSignalSource).toBe('watttime')
  })

  it('detects watttime from api key credentials', async () => {
    mockedEnv.WATTTIME_API_KEY = 'wt-api-key'

    const snapshot = await buildHealthSnapshot()

    expect(snapshot.carbonSignalSource).toBe('watttime')
  })

  it('falls back to sandbox-mock when no provider keys are present', async () => {
    const snapshot = await buildHealthSnapshot()

    expect(snapshot.carbonSignalSource).toBe('sandbox-mock')
  })

  it('survives a redis outage', async () => {
    jest.spyOn(redis, 'ping').mockRejectedValueOnce(new Error('redis down'))

    const snapshot = await buildHealthSnapshot()

    expect(snapshot.redis).toBe(false)
    expect(snapshot.database).toBe(true)
  })

  it('survives a database outage', async () => {
    jest.spyOn(prisma.decisionTraceEnvelope, 'count').mockRejectedValueOnce(new Error('db down'))

    const snapshot = await buildHealthSnapshot()

    expect(snapshot.database).toBe(false)
    expect(snapshot.totalDecisionsServed).toBe(0)
  })
})
