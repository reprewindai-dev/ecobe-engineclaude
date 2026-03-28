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
  it('keeps proof-critical outputs stable when decisionFrameId and timestamp are pinned', async () => {
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
    })

    expect(first.response.decisionFrameId).toBe('frame-fixed-1')
    expect(second.response.decisionFrameId).toBe('frame-fixed-1')
    expect(first.response.decision).toBe(second.response.decision)
    expect(first.response.selectedRegion).toBe(second.response.selectedRegion)
    expect(first.response.reasonCode).toBe(second.response.reasonCode)
    expect(first.response.proofHash).toBe(second.response.proofHash)
  })
})
