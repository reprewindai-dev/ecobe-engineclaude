import {
  buildAssuranceStatus,
  buildMssState,
  resolveBaselineCandidate,
} from '../lib/ci/doctrine'
import { applyOperatingModePolicy, resolveOperatingMode } from '../lib/ci/operating-mode'

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

  it('marks MSS as last-known-good when cache is warm even without provider fallback', () => {
    const mss = buildMssState({
      candidate: {
        region: 'us-west-2',
        score: 1,
        carbonIntensity: 18,
        carbonSourceUsed: 'WATTTIME_MOER',
        carbonDisagreementFlag: false,
        carbonDisagreementPct: 0,
        carbonFallbackUsed: false,
        waterSignal: {
          region: 'us-west-2',
          source: ['aqueduct_4_0', 'aware_2_0', 'nrel_water_factors_v1'],
          scenario: 'current',
          confidence: 0.85,
          facilityId: null,
          signalType: 'average_operational',
          dataQuality: 'high',
          supplierSet: ['aqueduct', 'aware', 'nrel'],
          evidenceRefs: ['water-bundle:2026-03-24T00:00:00.000Z:us-west-2'],
          fallbackUsed: false,
          telemetryRef: null,
          authorityMode: 'basin',
          referenceTime: '2026-03-29T19:48:35.833Z',
          scarcityFactor: 1.3,
          datasetVersions: {
            nrel: 'nrel_water_factors_v1',
            aware: 'aware_2_0',
            aqueduct: 'aqueduct_4_0',
          },
          droughtRiskIndex: 2.2,
          waterStressIndex: 2.1,
          waterQualityIndex: 2,
          artifactGeneratedAt: '2026-03-24T00:00:00.000Z',
          waterIntensityLPerKwh: 0.9,
        },
        waterImpactLiters: 2.25,
        scarcityImpact: 2.925,
        guardrailCandidateBlocked: false,
        guardrailReasons: [],
        providerSnapshotRef: 'us-west-2:WATTTIME_MOER:2026-03-29T19:48:00.000Z',
        waterAuthority: {
          authorityMode: 'basin',
          scenario: 'current',
          confidence: 0.85,
          supplierSet: ['aqueduct', 'aware', 'nrel'],
          evidenceRefs: ['water-bundle:2026-03-24T00:00:00.000Z:us-west-2'],
          facilityId: null,
          telemetryRef: null,
          bundleHash: 'bundle',
          manifestHash: 'manifest',
        },
      },
      assurance: {
        operationallyUsable: true,
        assuranceReady: true,
        status: 'assurance_ready',
        issues: [],
      },
      carbonFreshnessSec: 36,
      waterFreshnessSec: 503316,
      cacheStatus: 'warm',
    })

    expect(mss.lastKnownGoodApplied).toBe(true)
    expect(mss.carbonProviderHealth).toBe('HEALTHY')
  })

  it('marks water authority health as failed when assurance is not operational', () => {
    const mss = buildMssState({
      candidate: {
        region: 'us-west-2',
        score: 1,
        carbonIntensity: 18,
        carbonSourceUsed: 'WATTTIME_MOER',
        carbonDisagreementFlag: false,
        carbonDisagreementPct: 0,
        carbonFallbackUsed: false,
        waterSignal: {
          region: 'us-west-2',
          source: ['aqueduct_4_0'],
          scenario: 'current',
          confidence: 0.85,
          facilityId: null,
          signalType: 'average_operational',
          dataQuality: 'high',
          supplierSet: ['aqueduct'],
          evidenceRefs: ['water-bundle:2026-03-24T00:00:00.000Z:us-west-2'],
          fallbackUsed: false,
          telemetryRef: null,
          authorityMode: 'basin',
          referenceTime: '2026-03-29T19:48:35.833Z',
          scarcityFactor: 1.3,
          datasetVersions: {
            nrel: 'nrel_water_factors_v1',
            aware: 'aware_2_0',
            aqueduct: 'aqueduct_4_0',
          },
          droughtRiskIndex: 2.2,
          waterStressIndex: 2.1,
          waterQualityIndex: 2,
          artifactGeneratedAt: '2026-03-24T00:00:00.000Z',
          waterIntensityLPerKwh: 0.9,
        },
        waterImpactLiters: 2.25,
        scarcityImpact: 2.925,
        guardrailCandidateBlocked: false,
        guardrailReasons: [],
        providerSnapshotRef: 'us-west-2:WATTTIME_MOER:2026-03-29T19:48:00.000Z',
        waterAuthority: {
          authorityMode: 'basin',
          scenario: 'current',
          confidence: 0.85,
          supplierSet: ['aqueduct'],
          evidenceRefs: ['water-bundle:2026-03-24T00:00:00.000Z:us-west-2'],
          facilityId: null,
          telemetryRef: null,
          bundleHash: 'bundle',
          manifestHash: 'manifest',
        },
      },
      assurance: {
        operationallyUsable: false,
        assuranceReady: false,
        status: 'degraded',
        issues: ['water_authority_in_fallback_mode'],
      },
      carbonFreshnessSec: 36,
      waterFreshnessSec: 503316,
      cacheStatus: 'live',
    })

    expect(mss.waterAuthorityHealth).toBe('FAILED')
  })
})
