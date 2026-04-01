jest.mock('../lib/carbon/provider-router', () => ({
  providerRouter: {
    getCachedRoutingSignalRecord: jest.fn().mockResolvedValue(null),
    getRoutingSignalRecord: jest.fn().mockResolvedValue({
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
    enabled: false,
    strict: false,
    evaluated: false,
    applied: false,
    hookStatus: 'not_configured',
    reasonCodes: ['SEKED_POLICY_ADAPTER_DISABLED_OR_UNCONFIGURED'],
    policyReference: null,
    fallbackUsed: false,
    hardFailure: false,
    enforcedFailureAction: null,
    response: null,
  }),
}))

jest.mock('../lib/db', () => ({
  prisma: {
    cIDecision: {},
  },
}))

jest.mock('../lib/ci/idempotency', () => ({
  buildIdempotencyCacheKey: jest.fn(),
  readIdempotentResponse: jest.fn().mockResolvedValue(null),
  writeIdempotentResponse: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../lib/cache-warmer', () => ({
  trackRecentRoutingRegions: jest.fn(),
}))

import { createDecision } from '../routes/ci'

describe('ci replay determinism', () => {
  it('uses resolved candidate overrides and avoids deep artifact validation in replay mode', async () => {
    const { providerRouter } = require('../lib/carbon/provider-router')
    const waterBundle = require('../lib/water/bundle')
    const request = {
      requestId: 'req-1',
      preferredRegions: ['us-west-2'],
      timestamp: '2026-03-28T10:00:00.000Z',
      jobType: 'standard' as const,
      criticality: 'standard' as const,
      waterPolicyProfile: 'default' as const,
      allowDelay: true,
      criticalPath: false,
      signalPolicy: 'marginal_first' as const,
      carbonWeight: 0.7,
      waterWeight: 0.3,
      latencyWeight: 0.1,
      costWeight: 0.1,
    }

    const first = await createDecision(request, {
      decisionFrameId: 'frame-fixed-1',
      nowIso: '2026-03-28T10:00:00.000Z',
    })
    const second = await createDecision(request, {
      decisionFrameId: 'frame-fixed-1',
      nowIso: '2026-03-28T10:00:00.000Z',
      resolvedCandidateOverrides: first.persistable.candidateEvaluations,
    })

    expect(first.response.decisionFrameId).toBe('frame-fixed-1')
    expect(second.response.decisionFrameId).toBe('frame-fixed-1')
    expect(first.response.decision).toBe(second.response.decision)
    expect(first.response.selectedRegion).toBe(second.response.selectedRegion)
    expect(first.response.reasonCode).toBe(second.response.reasonCode)
    expect(first.response.proofHash).toBe(second.response.proofHash)
    expect(providerRouter.getRoutingSignalRecord).toHaveBeenCalledTimes(1)
    expect(providerRouter.getCachedRoutingSignalRecord).toHaveBeenCalledTimes(1)
    expect(waterBundle.loadWaterArtifacts).not.toHaveBeenCalled()
    expect(waterBundle.validateWaterArtifacts).not.toHaveBeenCalled()
  })
})
