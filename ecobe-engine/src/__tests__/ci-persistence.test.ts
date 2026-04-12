jest.mock('../lib/carbon/provider-router', () => ({
  providerRouter: {
    getHotPathRoutingSignalRecord: jest.fn().mockResolvedValue({
      signal: {
        carbonIntensity: 180,
        source: 'watttime',
        isForecast: false,
        confidence: 0.9,
        signalMode: 'marginal',
        accountingMethod: 'marginal',
        provenance: {
          sourceUsed: 'WATTTIME_MOER',
          contributingSources: ['watttime'],
          referenceTime: '2026-03-28T10:00:00.000Z',
          fetchedAt: '2026-03-28T10:00:00.000Z',
          fallbackUsed: false,
          disagreementFlag: false,
          disagreementPct: 0,
        },
      },
      fetchedAt: '2026-03-28T10:00:00.000Z',
      stalenessSec: 0,
      lastLatencyMs: 12,
      degraded: false,
      cacheSource: 'warm',
    }),
    cacheRoutingSignal: jest.fn().mockResolvedValue(undefined),
  },
}))

jest.mock('../lib/water/bundle', () => ({
  resolveWaterSignal: jest.fn().mockImplementation((region: string) => ({
    region,
    waterIntensityLPerKwh: 1.25,
    waterStressIndex: 2.1,
    waterQualityIndex: null,
    droughtRiskIndex: null,
    scarcityFactor: 1.4,
    source: ['aqueduct', 'aware'],
    datasetVersions: { aqueduct: 'v1', aware: 'v1' },
    confidence: 0.92,
    fallbackUsed: false,
    dataQuality: 'high',
    signalType: 'average_operational',
    referenceTime: '2026-03-28T10:00:00.000Z',
    authorityMode: 'basin',
    scenario: 'current',
    facilityId: null,
    supplierSet: ['aqueduct', 'aware'],
    evidenceRefs: ['water:aqueduct:v1'],
    telemetryRef: null,
    artifactGeneratedAt: '2026-03-28T09:00:00.000Z',
  })),
  buildWaterAuthority: jest.fn().mockImplementation((signal: any) => ({
    authorityMode: signal.authorityMode,
    scenario: signal.scenario,
    confidence: signal.confidence,
    supplierSet: signal.supplierSet,
    evidenceRefs: signal.evidenceRefs,
    facilityId: signal.facilityId,
    telemetryRef: signal.telemetryRef,
    bundleHash: 'bundle-hash',
    manifestHash: 'manifest-hash',
  })),
  getWaterArtifactHealthSnapshot: jest.fn().mockReturnValue({
    healthy: true,
    bundleHealthy: true,
    manifestHealthy: true,
    schemaCompatible: true,
    datasetHashesPresent: true,
    checks: {
      bundlePresent: true,
      manifestPresent: true,
      schemaCompatible: true,
      regionCount: 2,
      sourceCount: 2,
      datasetHashesPresent: true,
    },
    errors: [],
    manifestDatasets: [
      {
        name: 'aqueduct',
        source_url: 'https://example.com/aqueduct',
        file_hash: 'hash-aqueduct',
        downloaded_at: '2026-03-28T09:00:00.000Z',
        dataset_version: 'v1',
      },
      {
        name: 'aware',
        source_url: 'https://example.com/aware',
        file_hash: 'hash-aware',
        downloaded_at: '2026-03-28T09:00:00.000Z',
        dataset_version: 'v1',
      },
    ],
    artifactMetadata: {
      bundleHash: 'bundle-hash',
      manifestHash: 'manifest-hash',
      bundleGeneratedAt: '2026-03-28T09:00:00.000Z',
      manifestBuiltAt: '2026-03-28T09:00:00.000Z',
      datasetHashesPresent: true,
      sourceCount: 2,
      suppliers: ['aqueduct', 'aware'],
    },
  }),
  loadWaterArtifacts: jest.fn(),
  validateWaterArtifacts: jest.fn(),
  summarizeWaterProviders: jest.fn().mockReturnValue([]),
}))

jest.mock('../lib/learning/region-reliability', () => ({
  loadRegionReliabilityMultipliers: jest.fn().mockResolvedValue({ 'us-west-2': 1 }),
}))

jest.mock('../lib/policy/external-hook', () => ({
  evaluateExternalPolicyHook: jest.fn().mockResolvedValue({
    enabled: false,
    strict: false,
    evaluated: false,
    applied: false,
    hookStatus: 'not_configured',
    reasonCodes: ['EXTERNAL_POLICY_HOOK_DISABLED_OR_UNCONFIGURED'],
    policyReference: null,
    fallbackUsed: false,
    hardFailure: false,
    enforcedFailureAction: null,
    response: null,
  }),
}))

jest.mock('../lib/policy/seked-policy-adapter', () => ({
  evaluateSekedPolicyAdapter: jest.fn().mockResolvedValue({
    enabled: true,
    strict: false,
    evaluated: true,
    applied: true,
    hookStatus: 'success',
    reasonCodes: [],
    policyReference: 'seked://internal/default',
    fallbackUsed: false,
    hardFailure: false,
    enforcedFailureAction: null,
    response: {
      governance: {
        source: 'SEKED_INTERNAL_V1',
        score: 0.42,
        zone: 'amber',
        weights: {
          carbon: 0.6,
          water: 0.3,
          latency: 0.1,
          cost: 0.05,
        },
        thresholds: {
          reroute: 0.35,
          delay: 0.65,
        },
      },
    },
  }),
}))

jest.mock('../lib/cache-warmer', () => ({
  trackRecentRoutingRegions: jest.fn(),
}))

jest.mock('../lib/ci/idempotency', () => ({
  buildIdempotencyCacheKey: jest.fn(),
  readIdempotentResponse: jest.fn().mockResolvedValue(null),
  writeIdempotentResponse: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../lib/observability/otel', () => ({
  buildDecisionSpanRecord: jest.fn().mockImplementation((input: any) => ({
    spanName: 'ci.authorize',
    serviceName: 'ecobe-engine',
    traceId: input.traceId ?? 'otel-trace',
    spanId: 'otel-span',
    durationMs: 41,
    attributes: {},
  })),
  exportDecisionSpanRecord: jest.fn().mockResolvedValue({
    enabled: false,
    exported: false,
    endpoint: null,
  }),
}))

jest.mock('../lib/db')

import { prisma } from '../lib/db'
import { createDecision, flushCiAncillaryPersistenceForTests, persistCiDecisionResult } from '../routes/ci'

describe('ci persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([{ value: 41 }])
    ;(prisma.cIDecision.findFirst as jest.Mock).mockResolvedValue(null)
    ;(prisma.cIDecision.create as jest.Mock).mockResolvedValue({ id: 'cid-1' })
    ;(prisma.decisionTraceEnvelope.findFirst as jest.Mock).mockResolvedValue(null)
    ;(prisma.decisionTraceEnvelope.upsert as jest.Mock).mockResolvedValue({
      traceHash: 'persisted-trace-hash',
    })
    ;(prisma.integrationWebhookSink.findMany as jest.Mock).mockResolvedValue([])
    ;(prisma.waterPolicyEvidence.create as jest.Mock).mockResolvedValue({})
    ;(prisma.waterProviderSnapshot.createMany as jest.Mock).mockResolvedValue({ count: 2 })
    ;(prisma.waterScenarioRun.create as jest.Mock).mockResolvedValue({})
    ;(prisma.facilityWaterTelemetry.create as jest.Mock).mockResolvedValue({})
  })

  it('persists core decision artifacts even when ancillary writes fail', async () => {
    ;(prisma.waterPolicyEvidence.create as jest.Mock).mockRejectedValueOnce(new Error('ancillary exploded'))

    const result = await createDecision(
      {
        requestId: 'req-1',
        preferredRegions: ['us-west-2'],
        timestamp: '2026-03-28T10:00:00.000Z',
        jobType: 'standard',
        criticality: 'standard',
        waterPolicyProfile: 'default',
        allowDelay: true,
        criticalPath: false,
        signalPolicy: 'marginal_first',
        carbonWeight: 0.7,
        waterWeight: 0.3,
        latencyWeight: 0.1,
        costWeight: 0.1,
      },
      {
        decisionFrameId: 'frame-persist-1',
        nowIso: '2026-03-28T10:00:00.000Z',
      }
    )

    const persisted = await persistCiDecisionResult(result, {
      total: 55,
      compute: 41,
    })

    expect(persisted.response.decisionFrameId).toBe('frame-persist-1')
    expect(persisted.traceHash).toBe('persisted-trace-hash')
    expect(prisma.cIDecision.create).toHaveBeenCalledTimes(1)
    expect(prisma.decisionTraceEnvelope.upsert).toHaveBeenCalledTimes(1)

    await flushCiAncillaryPersistenceForTests()

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed ancillary CI persistence (water policy evidence)'),
      expect.any(Error)
    )
  })
})
