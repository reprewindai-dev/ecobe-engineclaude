import { CiResponseV2Schema } from '../lib/ci/contracts'

describe('CiResponseV2 contract freeze', () => {
  it('keeps top-level deterministic contract keys stable', () => {
    const keys = Object.keys(CiResponseV2Schema.shape).sort()
    expect(keys).toEqual(
      [
        'accountingMethod',
        'assurance',
        'baseline',
        'candidateEvaluations',
        'decision',
        'decisionEnvelope',
        'decisionExplanation',
        'decisionTrust',
        'decisionMode',
        'decisionFrameId',
        'doctrineVersion',
        'enforcementBundle',
        'fallbackUsed',
        'kubernetesEnforcement',
        'latencyMs',
        'mss',
        'notBefore',
        'operatingMode',
        'policyTrace',
        'proofEnvelope',
        'proofHash',
        'proofRecord',
        'reasonCode',
        'recommendation',
        'savings',
        'selected',
        'selectedRegion',
        'selectedRunner',
        'signalConfidence',
        'signalMode',
        'telemetryBridge',
        'water',
        'waterAuthority',
        'workloadClass',
        'workflowOutputs',
        'adapterContext',
      ].sort()
    )
  })

  it('keeps policy trace sub-contracts for external and SEKED adapters', () => {
    const policyTraceShape = CiResponseV2Schema.shape.policyTrace.shape
    expect(policyTraceShape).toHaveProperty('externalPolicy')
    expect(policyTraceShape).toHaveProperty('sekedPolicy')
    expect(policyTraceShape).toHaveProperty('conflictHierarchy')
    expect(policyTraceShape).toHaveProperty('operatingMode')
  })

  it('keeps water proof fields required for assurance exports', () => {
    const waterShape = CiResponseV2Schema.shape.water.shape
    expect(Object.keys(waterShape)).toEqual(
      expect.arrayContaining([
        'selectedLiters',
        'baselineLiters',
        'selectedScarcityImpact',
        'baselineScarcityImpact',
        'intensityLPerKwh',
        'stressIndex',
        'qualityIndex',
        'droughtRiskIndex',
        'confidence',
        'source',
        'datasetVersion',
        'guardrailTriggered',
        'fallbackUsed',
      ])
    )
  })

  it('keeps richer explanation and trust fields stable', () => {
    const explanationShape = CiResponseV2Schema.shape.decisionExplanation.shape
    expect(explanationShape).toHaveProperty('dominantConstraint')
    expect(explanationShape).toHaveProperty('policyPrecedence')
    expect(explanationShape).toHaveProperty('counterfactualCondition')
    expect(explanationShape).toHaveProperty('uncertaintySummary')

    const trustShape = CiResponseV2Schema.shape.decisionTrust.shape
    expect(trustShape).toHaveProperty('signalFreshness')
    expect(trustShape).toHaveProperty('providerTrust')
    expect(trustShape).toHaveProperty('disagreement')
    expect(trustShape).toHaveProperty('estimatedFields')
    expect(trustShape).toHaveProperty('replayability')
    expect(trustShape).toHaveProperty('fallbackMode')
    expect(trustShape).toHaveProperty('degradedState')
  })

  it('keeps canonical decision and proof envelopes available for adapter callers', () => {
    expect(CiResponseV2Schema.shape).toHaveProperty('decisionEnvelope')
    expect(CiResponseV2Schema.shape).toHaveProperty('proofEnvelope')
    expect(CiResponseV2Schema.shape).toHaveProperty('telemetryBridge')
  })
})
