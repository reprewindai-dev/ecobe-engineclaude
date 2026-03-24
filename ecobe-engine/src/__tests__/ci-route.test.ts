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

describe('CI routing control layer', () => {
  const internalKey = 'test-internal-key'
  let app: any
  let request: any
  let routeGreen: jest.Mock
  let prisma: any
  let CarbonBudgetViolationError: any

  function postWithAuth(path: string) {
    return request(app).post(path).set('Authorization', `Bearer ${internalKey}`)
  }

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    process.env.ECOBE_INTERNAL_API_KEY = internalKey

    const express = require('express')
    request = require('supertest')
    routeGreen = require('../lib/green-routing').routeGreen
    prisma = require('../lib/db').prisma
    CarbonBudgetViolationError = require('../lib/routing').CarbonBudgetViolationError
    const ciRoutes = require('../routes/ci').default

    app = express()
    app.use(express.json())
    app.use('/api/v1/ci', ciRoutes)
  })

  afterEach(() => {
    delete process.env.ECOBE_INTERNAL_API_KEY
  })

  it('requires internal auth for carbon-route', async () => {
    const response = await request(app).post('/api/v1/ci/carbon-route').send({
      workloadId: 'unauthorized-build',
      candidateRegions: ['eastus'],
    })

    expect(response.status).toBe(401)
    expect(response.body.code).toBe('UNAUTHORIZED_INTERNAL_CALL')
  })

  it('returns 400 for expired deadlines', async () => {
    const response = await postWithAuth('/api/v1/ci/carbon-route').send({
      workloadId: 'expired-build',
      candidateRegions: ['eastus'],
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
      selectedRegion: 'eastus',
      carbonIntensity: 115,
      score: 0.82,
      alternatives: [{ region: 'northeurope', carbonIntensity: 190, score: 0.31 }],
      evaluatedCandidates: [
        { region: 'eastus', carbonIntensity: 115, score: 0.82 },
        { region: 'northeurope', carbonIntensity: 190, score: 0.31 },
      ],
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
    const response = await postWithAuth('/api/v1/ci/carbon-route').send({
      workloadId: 'bounded-build',
      candidateRegions: ['eastus', 'northeurope'],
      durationMinutes: 30,
      delayToleranceMinutes: 120,
      deadline,
      criticality: 'deferable',
    })

    expect(response.status).toBe(200)
    expect(response.body.deadlineHandling.mode).toBe('immediate_only')
    expect(response.body.deadlineHandling.effectiveLookaheadMinutes).toBe(0)
    expect(response.body.decision).toBe('run_now')
    expect(response.body.shouldRun).toBe(true)
    expect(routeGreen).toHaveBeenCalledWith(
      expect.objectContaining({
        preferredRegions: ['eastus', 'northeurope'],
      })
    )
  })

  it('uses the declared baseline region for honest savings math', async () => {
    routeGreen.mockResolvedValue({
      selectedRegion: 'westus2',
      carbonIntensity: 100,
      score: 0.9,
      alternatives: [{ region: 'eastus', carbonIntensity: 200, score: 0.2 }],
      evaluatedCandidates: [
        { region: 'eastus', carbonIntensity: 200, score: 0.2 },
        { region: 'westus2', carbonIntensity: 100, score: 0.9 },
      ],
      decisionFrameId: 'decision-456',
      doctrine: 'lowest defensible signal',
      legalDisclaimer: 'routing disclaimer',
      mode: 'assurance',
      policyMode: 'sec_disclosure_strict',
      signalTypeUsed: 'average_operational',
      assurance: { confidenceLabel: 'high' },
      source_used: 'WATTTIME_MOER',
      validation_source: null,
      fallback_used: false,
      provider_disagreement: { flag: false, pct: 0 },
      confidenceBand: { low: 90, mid: 100, high: 120, empirical: true },
      budgetStatus: [],
    })

    const response = await postWithAuth('/api/v1/ci/carbon-route').send({
      workloadId: 'reroute-build',
      candidateRegions: ['eastus', 'westus2'],
      baselineRegion: 'eastus',
      candidateRunners: ['ubuntu-latest'],
      matrixSize: 4,
    })

    expect(response.status).toBe(200)
    expect(response.body.decision).toBe('reroute')
    expect(response.body.reasonCode).toBe('CLEANER_REGION_AVAILABLE')
    expect(response.body.baselineRegion).toBe('eastus')
    expect(response.body.baselineCarbonIntensity).toBe(200)
    expect(response.body.selectedCarbonIntensity).toBe(100)
    expect(response.body.estimatedSavingsPercent).toBe(50)
    expect(prisma.cIDecision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          baseline: 200,
          savings: 50,
        }),
      })
    )
  })

  it('denies execution in assurance mode when only low-confidence fallback signals are available', async () => {
    routeGreen.mockResolvedValue({
      selectedRegion: 'eastus',
      carbonIntensity: 315,
      score: 0.12,
      alternatives: [{ region: 'northeurope', carbonIntensity: 330, score: 0.1 }],
      evaluatedCandidates: [
        { region: 'eastus', carbonIntensity: 315, score: 0.12 },
        { region: 'northeurope', carbonIntensity: 330, score: 0.1 },
      ],
      decisionFrameId: 'decision-deny',
      doctrine: 'lowest defensible signal',
      legalDisclaimer: 'routing disclaimer',
      mode: 'assurance',
      policyMode: 'sec_disclosure_strict',
      signalTypeUsed: 'average_operational',
      assurance: { confidenceLabel: 'low' },
      source_used: 'EMBER_STRUCTURAL_BASELINE',
      validation_source: null,
      fallback_used: true,
      provider_disagreement: { flag: false, pct: 0 },
      confidenceBand: { low: 300, mid: 315, high: 340, empirical: false },
      budgetStatus: [],
    })

    const response = await postWithAuth('/api/v1/ci/carbon-route').send({
      workloadId: 'strict-build',
      candidateRegions: ['eastus', 'northeurope'],
      assuranceMode: true,
    })

    expect(response.status).toBe(200)
    expect(response.body.decision).toBe('deny')
    expect(response.body.reasonCode).toBe('INSUFFICIENT_TRUSTED_SIGNALS')
    expect(response.body.shouldRun).toBe(false)
    expect(response.body.maxParallel).toBe(0)
    expect(response.body.estimatedSavingsPercent).toBeNull()
    expect(prisma.cIDecision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            decision: 'deny',
            reasonCode: 'INSUFFICIENT_TRUSTED_SIGNALS',
          }),
        }),
      })
    )
  })

  it('throttles critical execution when water guardrails remain active', async () => {
    routeGreen.mockResolvedValue({
      selectedRegion: 'eastus',
      carbonIntensity: 118,
      score: 0.88,
      alternatives: [{ region: 'westus2', carbonIntensity: 140, score: 0.52 }],
      evaluatedCandidates: [
        { region: 'eastus', carbonIntensity: 118, score: 0.88 },
        { region: 'westus2', carbonIntensity: 140, score: 0.52 },
      ],
      decisionFrameId: 'decision-water-throttle',
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
      confidenceBand: { low: 105, mid: 118, high: 130, empirical: true },
      budgetStatus: [],
      water: {
        policyProfile: 'high_water_sensitivity',
        selectedWaterLiters: 1.1,
        baselineWaterLiters: 1.4,
        selectedWaterScarcityImpact: 0.42,
        baselineWaterScarcityImpact: 0.61,
        selectedWaterIntensityLPerKwh: 1.5,
        baselineWaterIntensityLPerKwh: 1.8,
        waterStressIndex: 4.6,
        waterQualityIndex: 2.2,
        droughtRiskIndex: 3.7,
        confidence: 0.81,
        source: 'aqueduct+aware_2_0+nrel',
        signalType: 'scarcity_weighted_operational',
        datasetVersion: 'aqueduct_4_0_2023_08_16|aware_2_0_2025_07_24|nrel_water_factor_library_v1',
        fallbackUsed: false,
        guardrailTriggered: true,
        referenceTime: new Date().toISOString(),
      },
    })

    const response = await postWithAuth('/api/v1/ci/carbon-route').send({
      workloadId: 'water-guardrail-build',
      candidateRegions: ['eastus', 'westus2'],
      criticality: 'critical',
      matrixSize: 6,
      waterPolicyProfile: 'high_water_sensitivity',
    })

    expect(response.status).toBe(200)
    expect(response.body.decision).toBe('throttle')
    expect(response.body.reasonCode).toBe('WATER_GUARDRAIL_THROTTLED')
    expect(response.body.maxParallel).toBe(1)
    expect(response.body.water.guardrailTriggered).toBe(true)
    expect(response.body.workflowOutputs.water_stress_index).toBe('4.6')
    expect(prisma.cIDecision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            decision: 'throttle',
            reasonCode: 'WATER_GUARDRAIL_THROTTLED',
            water: expect.objectContaining({
              guardrailTriggered: true,
              policyProfile: 'high_water_sensitivity',
            }),
          }),
        }),
      })
    )
  })

  it('returns a deny decision when a carbon budget policy blocks the request', async () => {
    routeGreen.mockRejectedValue(new CarbonBudgetViolationError([]))

    const response = await postWithAuth('/api/v1/ci/carbon-route').send({
      workloadId: 'budget-build',
      candidateRegions: ['eastus', 'westus2'],
      orgId: 'org-1',
    })

    expect(response.status).toBe(200)
    expect(response.body.decision).toBe('deny')
    expect(response.body.reasonCode).toBe('CARBON_BUDGET_EXCEEDED')
    expect(response.body.shouldRun).toBe(false)
    expect(prisma.cIDecision.create).toHaveBeenCalled()
  })

  it('normalizes legacy /api/v1/ci/route payloads', async () => {
    routeGreen.mockResolvedValue({
      selectedRegion: 'northeurope',
      carbonIntensity: 95,
      score: 0.91,
      alternatives: [{ region: 'eastus', carbonIntensity: 180, score: 0.28 }],
      evaluatedCandidates: [
        { region: 'northeurope', carbonIntensity: 95, score: 0.91 },
        { region: 'eastus', carbonIntensity: 180, score: 0.28 },
      ],
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

    const response = await postWithAuth('/api/v1/ci/route').send({
      preferredRegions: ['northeurope', 'eastus'],
      carbonWeight: 0.9,
      latencyWeight: 0.05,
      costWeight: 0.05,
      durationMinutes: 20,
      delayToleranceMinutes: 0,
    })

    expect(response.status).toBe(200)
    expect(routeGreen).toHaveBeenCalledWith(
      expect.objectContaining({
        preferredRegions: ['northeurope', 'eastus'],
        carbonWeight: 0.9,
        latencyWeight: 0.05,
        costWeight: 0.05,
        workloadName: 'legacy-ci-route',
      })
    )
    expect(response.body.selectedRegion).toBe('northeurope')
    expect(response.body.decision).toBe('run_now')
  })
})
