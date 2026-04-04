import {
  buildAssuranceStatus,
  buildDecisionExplanation,
  buildDecisionTrust,
  normalizeWorkloadClass,
  resolveBaselineCandidate,
  type CandidateLike,
} from '../lib/ci/doctrine'
import { applyOperatingModePolicy, resolveOperatingMode } from '../lib/ci/operating-mode'

const candidate = {
  region: 'us-west-2',
  score: 0.12,
  carbonIntensity: 180,
  carbonSourceUsed: 'WATTTIME_MOER',
  carbonDisagreementFlag: true,
  carbonDisagreementPct: 12.4,
  carbonFallbackUsed: false,
  waterSignal: {
    waterIntensityLPerKwh: 1.2,
    waterStressIndex: 2.4,
    waterScarcityImpact: 0.9,
    waterQualityIndex: 0.92,
    droughtRiskIndex: 0.31,
    confidence: 0.84,
    source: ['aqueduct_2_1'],
    datasetVersions: { aqueduct: '2.1.0' },
    fallbackUsed: false,
  },
  waterImpactLiters: 3,
  scarcityImpact: 2.1,
  guardrailCandidateBlocked: false,
  guardrailReasons: [],
  providerSnapshotRef: 'us-west-2:WATTTIME_MOER:2026-04-01T12:00:00.000Z',
  waterAuthority: {
    authorityMode: 'basin' as const,
    scenario: 'current' as const,
    confidence: 0.84,
    supplierSet: ['aqueduct_2_1'],
    evidenceRefs: ['water:aqueduct:2.1'],
    facilityId: null,
    telemetryRef: null,
    bundleHash: 'bundle-hash',
    manifestHash: 'manifest-hash',
  },
} as unknown as CandidateLike

describe('ci doctrine helpers', () => {
  it('uses the first preferred region as the baseline when present', () => {
    const candidates = [
      { region: 'eu-west-1', score: 0.1 },
      { region: 'us-east-1', score: 0.2 },
    ]

    expect(resolveBaselineCandidate(['us-east-1', 'eu-west-1'], candidates, candidates[0])).toEqual(
      candidates[1]
    )
  })

  it('marks assurance as operational but not assurance-ready when dataset hashes are unverified', () => {
    const assurance = buildAssuranceStatus({
      datasetHashesPresent: false,
      bundleHealthy: true,
      manifestHealthy: true,
      waterFallbackUsed: false,
      carbonFallbackUsed: false,
      manifestDatasets: [
        {
          name: 'aqueduct',
          file_hash: 'unverified',
        },
      ],
    })

    expect(assurance.operationallyUsable).toBe(true)
    expect(assurance.assuranceReady).toBe(false)
    expect(assurance.status).toBe('operational')
  })

  it('normalizes workload classes additively from legacy request fields', () => {
    expect(
      normalizeWorkloadClass({
        criticality: 'critical',
        jobType: 'heavy',
      })
    ).toBe('emergency')

    expect(
      normalizeWorkloadClass({
        criticality: 'batch',
        jobType: 'standard',
      })
    ).toBe('batch')

    expect(
      normalizeWorkloadClass({
        workloadClass: 'regulated',
        criticality: 'standard',
        jobType: 'light',
      })
    ).toBe('regulated')
  })

  it('builds richer explanation and trust contracts from doctrine state', () => {
    const assurance = buildAssuranceStatus({
      datasetHashesPresent: true,
      bundleHealthy: true,
      manifestHealthy: true,
      waterFallbackUsed: false,
      carbonFallbackUsed: false,
      manifestDatasets: [
        {
          name: 'aqueduct',
          file_hash: 'verified-hash',
        },
      ],
    })

    const explanation = buildDecisionExplanation({
      decision: 'reroute',
      reasonCode: 'SEKED_POLICY_REROUTE',
      selected: candidate,
      baseline: { ...candidate, region: 'us-east-1', score: 0.44 },
      candidates: [candidate, { ...candidate, region: 'us-east-1', score: 0.44 }],
      profile: 'default',
      workloadClass: 'regulated',
    })

    expect(explanation.dominantConstraint).toBe('policy_hard_override')
    expect(explanation.policyPrecedence[0]).toBe('policy_hard_override')
    expect(explanation.counterfactualCondition.length).toBeGreaterThan(10)
    expect(explanation.uncertaintySummary).toContain('provider disagreement')

    const trust = buildDecisionTrust({
      selected: candidate,
      assurance,
      mss: {
        snapshotId: 'snapshot-1',
        carbonProvider: 'WATTTIME_MOER',
        carbonProviderHealth: 'HEALTHY',
        waterAuthorityHealth: 'HEALTHY',
        carbonFreshnessSec: 26,
        waterFreshnessSec: 91,
        cacheStatus: 'warm',
        disagreement: {
          flag: true,
          pct: 12.4,
        },
        lastKnownGoodApplied: true,
        carbonLineage: ['WATTTIME_MOER'],
        waterLineage: ['aqueduct_2_1'],
      },
      fallbackUsed: false,
      persisted: true,
      workloadClass: 'regulated',
    })

    expect(trust.providerTrust.providerTrustTier).toBe('medium')
    expect(trust.replayability.status).toBe('replayable')
    expect(trust.disagreement.present).toBe(true)
  })

  it('escalates to crisis mode when signal integrity collapses', () => {
    const mode = resolveOperatingMode({
      signalConfidence: 0.42,
      carbonFallbackUsed: true,
      waterFallbackUsed: false,
      disagreementPct: 26,
      hardWaterBlock: false,
      noSafeRegion: false,
      precedenceProtected: false,
      criticality: 'standard',
      allowDelay: true,
    })

    const result = applyOperatingModePolicy({
      mode,
      decision: 'run_now',
      reasonCode: 'RUN_ALLOWED',
      context: {
        signalConfidence: 0.42,
        carbonFallbackUsed: true,
        waterFallbackUsed: false,
        disagreementPct: 26,
        hardWaterBlock: false,
        noSafeRegion: false,
        precedenceProtected: false,
        criticality: 'standard',
        allowDelay: true,
      },
    })

    expect(mode).toBe('CRISIS')
    expect(result.adjustedAction).toBe('delay')
    expect(result.adjustedReasonCode).toBe('DELAY_CRISIS_MODE_SIGNAL_INTEGRITY')
  })
})
