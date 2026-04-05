import {
  classifyDecisionProjectionStatus,
  normalizeLegacySavingsRatio,
  projectDashboardRoutingDecision,
} from '../lib/ci/decision-projection'

describe('decision projection', () => {
  it('normalizes legacy percent savings into a ratio', () => {
    expect(normalizeLegacySavingsRatio(34.12)).toBeCloseTo(0.3412, 6)
    expect(normalizeLegacySavingsRatio(0.3412)).toBeCloseTo(0.3412, 6)
    expect(normalizeLegacySavingsRatio(null)).toBeNull()
  })

  it('marks rows without energy as suspect instead of fabricating grams', () => {
    const projected = projectDashboardRoutingDecision({
      sourceCiDecisionId: 'ci_1',
      sourceDecisionFrameId: 'frame_1',
      createdAt: '2026-04-01T00:00:00.000Z',
      projectedFrom: 'ci_replay',
      workloadName: 'job-1',
      opName: 'ci-decision',
      baselineRegion: 'us-west-1',
      chosenRegion: 'us-west-2',
      zoneBaseline: 'us-west-1',
      zoneChosen: 'us-west-2',
      carbonIntensityBaselineGPerKwh: 400,
      carbonIntensityChosenGPerKwh: 200,
      baselineEnergyKwh: null,
      chosenEnergyKwh: null,
      estimatedKwh: null,
      carbonDataQuality: null,
      reason: 'ALLOW',
      latencyEstimateMs: 10,
      latencyActualMs: 20,
      fallbackUsed: false,
      lowConfidence: false,
      signalConfidence: 0.9,
      dataFreshnessSeconds: 30,
      requestCount: 1,
      sourceUsed: 'WATTTIME_MOER',
      validationSource: 'WATTTIME_MOER',
      referenceTime: '2026-04-01T00:00:00.000Z',
      disagreementFlag: false,
      disagreementPct: 0,
      estimatedFlag: false,
      syntheticFlag: false,
      legacySavings: 50,
      carbonSavingsRatio: null,
      waterImpactLiters: 2,
      waterBaselineLiters: 4,
      waterScarcityImpact: 1,
      waterStressIndex: 2,
      waterConfidence: 0.85,
      proofHash: 'proof',
      decisionAction: 'run_now',
      decisionMode: 'runtime_authorization',
      meta: {},
    })

    expect(projected.qualityStatus).toBe('SUSPECT')
    expect(projected.qualityFlags).toContain('missing_baseline_energy_kwh')
    expect(projected.qualityFlags).toContain('missing_chosen_energy_kwh')
    expect(projected.row.baselineCo2G).toBeNull()
    expect(projected.row.chosenCo2G).toBeNull()
    expect(projected.row.co2BaselineG).toBeNull()
    expect(projected.row.co2ChosenG).toBeNull()
    expect(projected.row.carbonDataQuality).toBe('INCOMPLETE')
  })

  it('marks out-of-bounds carbon intensity rows invalid', () => {
    const projected = projectDashboardRoutingDecision({
      sourceCiDecisionId: 'ci_2',
      sourceDecisionFrameId: 'frame_2',
      createdAt: '2026-04-01T00:00:00.000Z',
      projectedFrom: 'ci_runtime',
      workloadName: 'job-2',
      opName: 'ci-decision',
      baselineRegion: 'us-west-1',
      chosenRegion: 'us-west-2',
      zoneBaseline: 'us-west-1',
      zoneChosen: 'us-west-2',
      carbonIntensityBaselineGPerKwh: 5000,
      carbonIntensityChosenGPerKwh: 100,
      baselineEnergyKwh: 1,
      chosenEnergyKwh: 1,
      estimatedKwh: 1,
      carbonDataQuality: 'DERIVED',
      reason: 'ALLOW',
      latencyEstimateMs: 10,
      latencyActualMs: 20,
      fallbackUsed: false,
      lowConfidence: false,
      signalConfidence: 0.9,
      dataFreshnessSeconds: 30,
      requestCount: 1,
      sourceUsed: 'WATTTIME_MOER',
      validationSource: 'WATTTIME_MOER',
      referenceTime: '2026-04-01T00:00:00.000Z',
      disagreementFlag: false,
      disagreementPct: 0,
      estimatedFlag: false,
      syntheticFlag: false,
      legacySavings: 10,
      carbonSavingsRatio: null,
      waterImpactLiters: 2,
      waterBaselineLiters: 4,
      waterScarcityImpact: 1,
      waterStressIndex: 2,
      waterConfidence: 0.85,
      proofHash: 'proof',
      decisionAction: 'run_now',
      decisionMode: 'runtime_authorization',
      meta: {},
    })

    expect(projected.qualityStatus).toBe('INVALID')
    expect(projected.qualityFlags).toContain('invalid_baseline_carbon')
  })

  it('marks shared legacy energy as derived instead of exact', () => {
    const projected = projectDashboardRoutingDecision({
      sourceCiDecisionId: 'ci_3',
      sourceDecisionFrameId: 'frame_3',
      createdAt: '2026-04-01T00:00:00.000Z',
      projectedFrom: 'ci_replay',
      workloadName: 'job-3',
      opName: 'ci-decision',
      baselineRegion: 'us-west-1',
      chosenRegion: 'us-west-2',
      zoneBaseline: 'us-west-1',
      zoneChosen: 'us-west-2',
      carbonIntensityBaselineGPerKwh: 400,
      carbonIntensityChosenGPerKwh: 200,
      baselineEnergyKwh: null,
      chosenEnergyKwh: null,
      estimatedKwh: 1.25,
      carbonDataQuality: null,
      reason: 'ALLOW',
      latencyEstimateMs: 10,
      latencyActualMs: 20,
      fallbackUsed: false,
      lowConfidence: false,
      signalConfidence: 0.9,
      dataFreshnessSeconds: 30,
      requestCount: 1,
      sourceUsed: 'WATTTIME_MOER',
      validationSource: 'WATTTIME_MOER',
      referenceTime: '2026-04-01T00:00:00.000Z',
      disagreementFlag: false,
      disagreementPct: 0,
      estimatedFlag: false,
      syntheticFlag: false,
      legacySavings: 50,
      carbonSavingsRatio: null,
      waterImpactLiters: 2,
      waterBaselineLiters: 4,
      waterScarcityImpact: 1,
      waterStressIndex: 2,
      waterConfidence: 0.85,
      proofHash: 'proof',
      decisionAction: 'run_now',
      decisionMode: 'runtime_authorization',
      meta: {},
    })

    expect(projected.row.baselineEnergyKwh).toBe(1.25)
    expect(projected.row.chosenEnergyKwh).toBe(1.25)
    expect(projected.row.carbonDataQuality).toBe('DERIVED')
    expect(projected.qualityStatus).toBe('CLEAN')
    expect(projected.qualityFlags).toContain('derived_energy_basis')
  })

  it('classifies stale projection lag correctly', () => {
    expect(classifyDecisionProjectionStatus(10)).toBe('healthy')
    expect(classifyDecisionProjectionStatus(10 * 60)).toBe('degraded')
    expect(classifyDecisionProjectionStatus(45 * 60)).toBe('stale')
    expect(classifyDecisionProjectionStatus(3 * 60 * 60)).toBe('broken')
  })
})
