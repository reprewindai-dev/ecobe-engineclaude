import { evaluateInternalSekedPolicy } from '../lib/policy/seked-internal'
import type { SekedPolicyAdapterRequest } from '../lib/policy/seked-policy-adapter'

function buildRequest(
  overrides: Partial<SekedPolicyAdapterRequest> = {}
): SekedPolicyAdapterRequest {
  return {
    decisionFrameId: 'frame-1',
    policyProfile: 'high_water_sensitivity',
    policyVersion: 'v1',
    decisionMode: 'runtime_authorization',
    criticality: 'standard',
    allowDelay: true,
    facilityId: null,
    scenario: 'current',
    bottleneckScore: 20,
    preferredRegions: ['us-west-2', 'us-east-1'],
    waterAuthority: {
      authorityMode: 'basin',
      confidence: 0.92,
      supplierSet: ['aqueduct', 'aware'],
      evidenceRefs: ['water:evidence:1'],
    },
    candidateSupplierProvenance: [
      {
        region: 'us-west-2',
        supplierSet: ['aqueduct', 'aware'],
        evidenceRefs: ['water:evidence:1'],
        authorityMode: 'basin',
      },
      {
        region: 'us-east-1',
        supplierSet: ['aqueduct', 'aware'],
        evidenceRefs: ['water:evidence:2'],
        authorityMode: 'basin',
      },
    ],
    weights: {
      carbon: 0.4,
      water: 0.35,
      latency: 0.15,
      cost: 0.1,
    },
    strict: true,
    candidates: [
      {
        region: 'us-west-2',
        score: 21,
        carbonIntensity: 80,
        waterStressIndex: 1.4,
        waterScarcityImpact: 0.9,
        guardrailCandidateBlocked: false,
      },
      {
        region: 'us-east-1',
        score: 34,
        carbonIntensity: 210,
        waterStressIndex: 2.5,
        waterScarcityImpact: 2.2,
        guardrailCandidateBlocked: false,
      },
    ],
    provisionalDecision: {
      action: 'run_now',
      reasonCode: 'ALLOW',
      selectedRegion: 'us-west-2',
      baselineRegion: 'us-east-1',
    },
    timestamp: new Date('2026-03-29T12:00:00.000Z').toISOString(),
    ...overrides,
  }
}

describe('evaluateInternalSekedPolicy', () => {
  it('emits an active internal governance source with persisted weights and thresholds', () => {
    const result = evaluateInternalSekedPolicy(buildRequest())

    expect(result.enabled).toBe(true)
    expect(result.evaluated).toBe(true)
    expect(result.applied).toBe(true)
    expect(result.response?.governance?.source).toBe('SEKED_INTERNAL_V1')
    expect(result.response?.governance?.weights).toEqual({
      carbon: 0.4,
      water: 0.35,
      latency: 0.15,
      cost: 0.1,
    })
    expect(result.response?.governance?.thresholds).toEqual({
      amberMin: 0.45,
      redMin: 0.7,
      minSignalConfidence: 0.6,
      waterStressDelay: 4,
      waterStressDeny: 4.7,
    })
    expect(result.policyReference).toBe('seked.internal.v1')
  })

  it('forces a red-zone delay when water stress crosses the deny threshold', () => {
    const result = evaluateInternalSekedPolicy(
      buildRequest({
        candidates: [
          {
            region: 'us-west-2',
            score: 42,
            carbonIntensity: 260,
            waterStressIndex: 5.1,
            waterScarcityImpact: 8.4,
            guardrailCandidateBlocked: false,
          },
        ],
        provisionalDecision: {
          action: 'run_now',
          reasonCode: 'ALLOW',
          selectedRegion: 'us-west-2',
          baselineRegion: 'us-west-2',
        },
      })
    )

    expect(result.response?.governance?.zone).toBe('red')
    expect(result.response?.action).toBe('delay')
    expect(result.response?.reasonCode).toBe('SEKED_POLICY_RED_ZONE')
  })
})
