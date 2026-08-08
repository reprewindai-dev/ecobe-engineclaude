import { buildHealthSnapshot } from '../services/health.service'

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

describe('health snapshot', () => {
  it('returns the new engine health fields', async () => {
    const snapshot = await buildHealthSnapshot()

    expect(snapshot.engineStatus).toBe('operational')
    expect(snapshot.policyEngineLoaded).toBe(true)
    expect(['watttime', 'electricitymaps', 'sandbox-mock']).toContain(snapshot.carbonSignalSource)
    expect(snapshot.tierGatingActive).toBe(true)
    expect(typeof snapshot.privateBoundaryConfigured).toBe('boolean')
    expect(snapshot.totalDecisionsServed).toBe(7)
    expect(typeof snapshot.uptime).toBe('number')
  })
})
