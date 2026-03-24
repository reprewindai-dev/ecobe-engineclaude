export {}

jest.mock('../lib/green-routing', () => ({
  routeGreen: jest.fn(),
}))

jest.mock('../lib/carbon-forecasting', () => ({
  findOptimalWindow: jest.fn(),
}))

jest.mock('../lib/db', () => ({
  prisma: {
    cIDecision: {
      create: jest.fn().mockResolvedValue(undefined),
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}))

const express = require('express')
const request = require('supertest')
const { routeGreen } = require('../lib/green-routing')
const ciRoutes = require('../routes/ci').default

describe('CI routing hardening', () => {
  let app: any

  beforeEach(() => {
    jest.clearAllMocks()
    app = express()
    app.use(express.json())
    app.use('/api/v1/ci', ciRoutes)
  })

  it('returns 400 for expired deadlines', async () => {
    const response = await request(app).post('/api/v1/ci/carbon-route').send({
      workloadId: 'expired-build',
      candidateRegions: ['us-east-1'],
      durationMinutes: 20,
      delayToleranceMinutes: 60,
      deadline: '2020-01-01T00:00:00.000Z',
    })

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Deadline expired')
    expect(response.body.details.minutesUntilDeadline).toBeLessThanOrEqual(0)
  })

  it('treats impossible deadlines as immediate-only routing', async () => {
    routeGreen.mockResolvedValue({
      selectedRegion: 'us-east-1',
      carbonIntensity: 115,
      score: 0.82,
      alternatives: [{ region: 'eu-west-1', carbonIntensity: 190, score: 0.31 }],
      decisionFrameId: 'decision-123',
      doctrine: 'lowest defensible signal',
      legalDisclaimer: 'routing disclaimer',
      mode: 'assurance',
      policyMode: 'sec_disclosure_strict',
      signalTypeUsed: 'average_operational',
      assurance: { confidenceLabel: 'high' },
      source_used: 'GRIDSTATUS_EIA930',
      validation_source: null,
      fallback_used: false,
      provider_disagreement: { flag: false, pct: 0 },
      confidenceBand: { low: 95, mid: 115, high: 140, empirical: true },
      budgetStatus: [],
    })

    const deadline = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const response = await request(app).post('/api/v1/ci/carbon-route').send({
      workloadId: 'bounded-build',
      candidateRegions: ['us-east-1', 'eu-west-1'],
      durationMinutes: 30,
      delayToleranceMinutes: 120,
      deadline,
      criticality: 'deferable',
    })

    expect(response.status).toBe(200)
    expect(response.body.deadlineHandling.mode).toBe('immediate_only')
    expect(response.body.deadlineHandling.effectiveLookaheadMinutes).toBe(0)
    expect(response.body.shouldRun).toBe(true)
    expect(routeGreen).toHaveBeenCalledWith(
      expect.objectContaining({
        preferredRegions: ['us-east-1', 'eu-west-1'],
      })
    )
  })

  it('normalizes legacy /api/v1/ci/route payloads', async () => {
    routeGreen.mockResolvedValue({
      selectedRegion: 'eu-west-1',
      carbonIntensity: 95,
      score: 0.91,
      alternatives: [{ region: 'us-east-1', carbonIntensity: 180, score: 0.28 }],
      decisionFrameId: 'legacy-456',
      doctrine: 'lowest defensible signal',
      legalDisclaimer: 'routing disclaimer',
      mode: 'optimize',
      policyMode: 'default',
      signalTypeUsed: 'average_operational',
      assurance: { confidenceLabel: 'medium' },
      source_used: 'EIA930_FUEL_MIX_IPCC',
      validation_source: null,
      fallback_used: false,
      provider_disagreement: { flag: false, pct: 0 },
      confidenceBand: { low: 80, mid: 95, high: 120, empirical: false },
      budgetStatus: [],
    })

    const response = await request(app).post('/api/v1/ci/route').send({
      preferredRegions: ['eu-west-1', 'us-east-1'],
      carbonWeight: 0.9,
      latencyWeight: 0.05,
      costWeight: 0.05,
      durationMinutes: 20,
      delayToleranceMinutes: 0,
    })

    expect(response.status).toBe(200)
    expect(routeGreen).toHaveBeenCalledWith(
      expect.objectContaining({
        preferredRegions: ['eu-west-1', 'us-east-1'],
        carbonWeight: 0.9,
        latencyWeight: 0.05,
        costWeight: 0.05,
        workloadName: 'legacy-ci-route',
      })
    )
    expect(response.body.selectedRegion).toBe('eu-west-1')
  })
})
