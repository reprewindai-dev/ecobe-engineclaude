import express from 'express'
import request from 'supertest'

jest.mock('../services/fingard-control', () => ({
  fingard: {
    getNormalizedSignal: jest.fn(),
  },
}))

const mockPrisma = {
  carbonLedgerEntry: {
    findMany: jest.fn(),
  },
  carbonCommandAccuracyDaily: {
    findMany: jest.fn(),
  },
  orgUsageCounter: {
    findMany: jest.fn(),
  },
  organization: {
    findMany: jest.fn(),
  },
  decisionTraceEnvelope: {
    findMany: jest.fn(),
  },
}

jest.mock('../lib/db', () => ({
  prisma: mockPrisma,
}))

describe('dashboard KPI aggregation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns live KPI aggregates from the ledger and trace tables', async () => {
    mockPrisma.carbonLedgerEntry.findMany
      .mockResolvedValueOnce([
        {
          baselineCarbonG: 1000,
          chosenCarbonG: 500,
          qualityTier: 'high',
          confidenceScore: 0.92,
          disagreementFlag: false,
          disagreementPct: 0,
          carbonSpikeProbability: 0.2,
          curtailmentProbability: 0.6,
          decisionFrameId: 'frame-a',
        },
        {
          baselineCarbonG: 800,
          chosenCarbonG: 600,
          qualityTier: 'medium',
          confidenceScore: 0.7,
          disagreementFlag: true,
          disagreementPct: 12,
          carbonSpikeProbability: 0.4,
          curtailmentProbability: 0.2,
          decisionFrameId: 'frame-b',
        },
      ])
      .mockResolvedValueOnce([
        {
          baselineCarbonG: 1000,
          chosenCarbonG: 500,
        },
      ])

    mockPrisma.carbonCommandAccuracyDaily.findMany.mockResolvedValueOnce([
      {
        totalCommands: 10,
        avgEmissionsVariancePct: 12,
      },
    ])

    mockPrisma.orgUsageCounter.findMany.mockResolvedValueOnce([
      {
        orgId: 'org-1',
        commandCount: 145,
        organization: {
          id: 'org-1',
          slug: 'alpha',
          name: 'Alpha Org',
          status: 'ACTIVE',
          monthlyCommandLimit: 1000,
        },
      },
      {
        orgId: 'org-2',
        commandCount: 80,
        organization: {
          id: 'org-2',
          slug: 'beta',
          name: 'Beta Org',
          status: 'ACTIVE',
          monthlyCommandLimit: 1000,
        },
      },
    ])

    mockPrisma.organization.findMany.mockResolvedValueOnce([
      {
        id: 'org-1',
        slug: 'alpha',
        name: 'Alpha Org',
        status: 'ACTIVE',
        monthlyCommandLimit: 1000,
      },
      {
        id: 'org-2',
        slug: 'beta',
        name: 'Beta Org',
        status: 'ACTIVE',
        monthlyCommandLimit: 1000,
      },
    ])

    mockPrisma.decisionTraceEnvelope.findMany.mockResolvedValueOnce([
      { decisionFrameId: 'frame-a' },
      { decisionFrameId: 'frame-b' },
    ])

    const dashboardApiRoutes = (await import('../routes/dashboard-api')).default
    const app = express()
    app.use('/api/v1', dashboardApiRoutes)

    const response = await request(app).get('/api/v1/dashboard/kpis')

    expect(response.status).toBe(200)
    expect(response.body.carbonReductionMultiplier).toBe(1.64)
    expect(response.body.carbonAvoidedToday).toBe(0.5)
    expect(response.body.carbonAvoidedThisMonth).toBe(0.7)
    expect(response.body.highConfidenceDecisionPct).toBe(50)
    expect(response.body.providerDisagreementRatePct).toBe(50)
    expect(response.body.forecastAccuracyVsRealized).toBe(88)
    expect(response.body.curtailmentOpportunityDetection).toBe(1)
    expect(response.body.carbonSpikeRisk).toBe(30)
    expect(response.body.perOrgCommandUsage).toEqual({
      alpha: 145,
      beta: 80,
    })
    expect(response.body.billingStatus).toBe('active')
    expect(response.body.replayAvailability).toBe(100)
  })
})
