import express from 'express'
import request from 'supertest'

const mockGetCachedSnapshots = jest.fn()
const mockDetectCurtailmentWindows = jest.fn()
const mockGetTopCurtailmentWindows = jest.fn()
const mockEstimateCurtailmentCarbonIntensity = jest.fn()
const mockDetectCarbonSpikeRisks = jest.fn()
const mockGetTopCarbonSpikeRisks = jest.fn()
const mockAnalyzeImportCarbonLeakage = jest.fn()
const mockGetTopImportLeakages = jest.fn()
const mockGroupByRegion = jest.fn()
const mockGridSignalFindMany = jest.fn()
const mockGridSignalFindFirst = jest.fn()
const mockCarbonCommandFindMany = jest.fn()
const mockCarbonCommandTraceFindMany = jest.fn()
const mockIntegrationEventFindMany = jest.fn()
const mockGetRegionMapping = jest.fn()
const mockGetRoutingSignal = jest.fn()

jest.mock('../lib/grid-signals/grid-signal-cache', () => ({
  GridSignalCache: {
    getCachedSnapshots: (...args: unknown[]) => mockGetCachedSnapshots(...args),
  },
}))

jest.mock('../lib/grid-signals/curtailment-detector', () => ({
  CurtailmentDetector: {
    detectCurtailmentWindows: (...args: unknown[]) => mockDetectCurtailmentWindows(...args),
    getTopCurtailmentWindows: (...args: unknown[]) => mockGetTopCurtailmentWindows(...args),
    estimateCurtailmentCarbonIntensity: (...args: unknown[]) =>
      mockEstimateCurtailmentCarbonIntensity(...args),
  },
}))

jest.mock('../lib/grid-signals/ramp-detector', () => ({
  RampDetector: {
    detectCarbonSpikeRisks: (...args: unknown[]) => mockDetectCarbonSpikeRisks(...args),
    getTopCarbonSpikeRisks: (...args: unknown[]) => mockGetTopCarbonSpikeRisks(...args),
  },
}))

jest.mock('../lib/grid-signals/interchange-analyzer', () => ({
  InterchangeAnalyzer: {
    analyzeImportCarbonLeakage: (...args: unknown[]) => mockAnalyzeImportCarbonLeakage(...args),
    getTopImportLeakages: (...args: unknown[]) => mockGetTopImportLeakages(...args),
    groupByRegion: (...args: unknown[]) => mockGroupByRegion(...args),
  },
}))

jest.mock('../lib/db', () => ({
  prisma: {
    gridSignalSnapshot: {
      findMany: (...args: unknown[]) => mockGridSignalFindMany(...args),
      findFirst: (...args: unknown[]) => mockGridSignalFindFirst(...args),
    },
    carbonCommand: {
      findMany: (...args: unknown[]) => mockCarbonCommandFindMany(...args),
    },
    carbonCommandTrace: {
      findMany: (...args: unknown[]) => mockCarbonCommandTraceFindMany(...args),
    },
    integrationEvent: {
      findMany: (...args: unknown[]) => mockIntegrationEventFindMany(...args),
    },
  },
}))

jest.mock('../lib/grid-signals/region-mapping', () => ({
  getRegionMapping: (...args: unknown[]) => mockGetRegionMapping(...args),
}))

jest.mock('../lib/carbon/provider-router', () => ({
  providerRouter: {
    getRoutingSignal: (...args: unknown[]) => mockGetRoutingSignal(...args),
  },
}))

import gridRouter, {
  buildGridRegionDetailFromRoutingSignal,
  buildGridRegionHistoryPointFromSnapshot,
  buildGridSummaryRegionFromRoutingSignal,
  normalizeGridSignalQuality,
  parseGridAuditRecord,
} from '../routes/intelligence/grid'

describe('grid intelligence routes', () => {
  const app = express()
  app.use('/api/v1/intelligence/grid', gridRouter)

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetRegionMapping.mockImplementation((region: string) =>
      region === 'us-east-1' ? { balancingAuthority: 'PJM' } : null
    )
    mockGetCachedSnapshots.mockResolvedValue(null)
    mockGridSignalFindMany.mockResolvedValue([])
    mockGridSignalFindFirst.mockResolvedValue(null)
    mockCarbonCommandFindMany.mockResolvedValue([])
    mockCarbonCommandTraceFindMany.mockResolvedValue([])
    mockIntegrationEventFindMany.mockResolvedValue([])
    mockGetRoutingSignal.mockResolvedValue(null)
    mockDetectCurtailmentWindows.mockReturnValue([])
    mockGetTopCurtailmentWindows.mockReturnValue([])
    mockEstimateCurtailmentCarbonIntensity.mockReturnValue(null)
    mockDetectCarbonSpikeRisks.mockReturnValue([])
    mockGetTopCarbonSpikeRisks.mockReturnValue([])
    mockAnalyzeImportCarbonLeakage.mockReturnValue([])
    mockGetTopImportLeakages.mockReturnValue([])
    mockGroupByRegion.mockReturnValue({})
  })

  it('normalizes mixed-case signal quality values and builds routing fallback summary regions', () => {
    expect(normalizeGridSignalQuality('HIGH')).toBe('high')
    expect(normalizeGridSignalQuality(' guarded ')).toBe('medium')

    const region = buildGridSummaryRegionFromRoutingSignal({
      region: 'us-east-1',
      balancingAuthority: 'PJM',
      signal: {
        carbonIntensity: 181,
        confidence: 0.84,
        provenance: { sourceUsed: 'WATTTIME_MOER' },
      },
    })

    expect(region).toEqual({
      region: 'us-east-1',
      balancingAuthority: 'PJM',
      carbonIntensity: 181,
      source: 'WATTTIME_MOER',
      demandRampPct: null,
      renewableRatio: null,
      fossilRatio: null,
      carbonSpikeProbability: null,
      curtailmentProbability: null,
      importCarbonLeakageScore: null,
      signalQuality: 'high',
    })
  })

  it('builds region detail from a live routing signal when snapshot history is unavailable', () => {
    const detail = buildGridRegionDetailFromRoutingSignal({
      region: 'us-east-1',
      balancingAuthority: 'PJM',
      signal: {
        carbonIntensity: 204,
        confidence: 0.52,
        provenance: { referenceTime: '2026-04-05T12:00:00.000Z' },
      },
    })

    expect(detail.latest.carbonIntensity).toBe(204)
    expect(detail.latest.signalQuality).toBe('medium')
    expect(detail.history).toHaveLength(1)

    const historyPoint = buildGridRegionHistoryPointFromSnapshot({
      timestamp: '2026-04-05T12:00:00.000Z',
      carbonIntensity: null,
      signalQuality: 'LOW',
    })

    expect(historyPoint.signalQuality).toBe('low')
  })

  it('parses only valid audit payloads', () => {
    expect(parseGridAuditRecord('{"ok":true}')).toEqual({ ok: true })
    expect(parseGridAuditRecord('not-json')).toBeNull()
    expect(parseGridAuditRecord(null)).toBeNull()
  })

  it('falls back to canonical routing signals in summary when EIA snapshots are unavailable', async () => {
    mockGetRoutingSignal.mockResolvedValue({
      carbonIntensity: 176,
      confidence: 0.86,
      provenance: {
        sourceUsed: 'WATTTIME_MOER',
        referenceTime: '2026-04-05T12:00:00.000Z',
      },
    })

    const response = await request(app)
      .get('/api/v1/intelligence/grid/summary?regions=us-east-1')
      .expect(200)

    expect(response.body.regions).toHaveLength(1)
    expect(response.body.regions[0]).toMatchObject({
      region: 'us-east-1',
      balancingAuthority: 'PJM',
      carbonIntensity: 176,
      source: 'WATTTIME_MOER',
      signalQuality: 'high',
    })
  })

  it('returns region detail from live routing signals when no snapshots exist', async () => {
    mockGetRoutingSignal.mockResolvedValue({
      carbonIntensity: 222,
      confidence: 0.61,
      provenance: {
        sourceUsed: 'LKG_WATTTIME_MOER',
        referenceTime: '2026-04-05T10:00:00.000Z',
      },
    })

    const response = await request(app)
      .get('/api/v1/intelligence/grid/region/us-east-1?hours=999')
      .expect(200)

    expect(response.body.region).toBe('us-east-1')
    expect(response.body.latest).toMatchObject({
      carbonIntensity: 222,
      signalQuality: 'medium',
    })
    expect(response.body.history).toHaveLength(1)
  })

  it('keeps hero metrics finite when optimized emissions sum to zero', async () => {
    mockCarbonCommandFindMany
      .mockResolvedValueOnce([
        { estimatedSavingsKgCo2e: 3, estimatedEmissionsKgCo2e: 0, confidence: 0.9 },
      ])
      .mockResolvedValueOnce([
        { estimatedSavingsKgCo2e: 8, estimatedEmissionsKgCo2e: 0, confidence: 0.9 },
      ])
      .mockResolvedValueOnce([
        { estimatedSavingsKgCo2e: 8, estimatedEmissionsKgCo2e: 0, confidence: 0.9 },
      ])

    mockCarbonCommandTraceFindMany.mockResolvedValue([
      { traceJson: JSON.stringify({ provenance: { disagreementFlag: true } }) },
      { traceJson: JSON.stringify({ provenance: { disagreementFlag: false } }) },
    ])

    const response = await request(app)
      .get('/api/v1/intelligence/grid/hero-metrics')
      .expect(200)

    expect(response.body.carbonReductionMultiplier).toBe(1)
    expect(Number.isFinite(response.body.carbonReductionMultiplier)).toBe(true)
    expect(response.body.providerDisagreementRatePct).toBe(50)
  })

  it('filters malformed audit records instead of failing the endpoint', async () => {
    mockIntegrationEventFindMany.mockResolvedValue([
      { message: '{"kind":"provider_snapshot","region":"PJM"}' },
      { message: 'garbage' },
      { message: null },
    ])

    const response = await request(app)
      .get('/api/v1/intelligence/grid/audit/PJM?hours=48')
      .expect(200)

    expect(response.body.records).toEqual([{ kind: 'provider_snapshot', region: 'PJM' }])
    expect(response.body.totalRecords).toBe(1)
  })
})
