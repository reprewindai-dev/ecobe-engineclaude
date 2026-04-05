import {
  buildDekesArtifactLinks,
  buildDekesDecisionSurface,
  estimateDekesEnergyKwh,
  parseDekesHandoffNotes,
  toDekesForecastStability,
  toDekesHandoffClassification,
  toDekesHandoffEventType,
  toDekesHandoffSeverity,
  toDekesHandoffStatus,
  toDekesQualityTier,
} from '../lib/dekes/canonical'

describe('dekes canonical helpers', () => {
  it('estimates energy from explicit kwh, results, duration, and fallback', () => {
    expect(estimateDekesEnergyKwh({ estimatedKwh: 1.23456789 })).toBe(1.234568)
    expect(estimateDekesEnergyKwh({ estimatedResults: 20 })).toBe(0.02)
    expect(estimateDekesEnergyKwh({ durationMinutes: 5 })).toBe(0.1)
    expect(estimateDekesEnergyKwh({})).toBe(0.05)
  })

  it('builds artifact links from the canonical decision frame id', () => {
    expect(buildDekesArtifactLinks('df_123')).toEqual({
      trace: '/api/v1/ci/decisions/df_123/trace',
      rawTrace: '/api/v1/ci/decisions/df_123/trace/raw',
      replay: '/api/v1/ci/decisions/df_123/replay',
      replayPacketJson: '/api/v1/ci/decisions/df_123/replay-packet.json',
      proofPacketJson: '/api/v1/ci/decisions/df_123/proof-packet.json',
      proofPacketPdf: '/api/v1/ci/decisions/df_123/proof-packet.pdf',
    })
  })

  it('parses stored handoff notes and preserves canonical fields', () => {
    const parsed = parseDekesHandoffNotes(
      JSON.stringify({
        decisionFrameId: 'df_456',
        proofId: 'proof_456',
        proofHash: 'abc123',
        decisionMode: 'runtime_authorization',
        action: 'deny',
        legacyAction: 'deny',
        reasonCode: 'WATER_POLICY_BLOCK',
        selectedRegion: 'us-east-1',
        selectedRunner: 'ubuntu-us-east-1',
        policyTrace: { policyVersion: 'water_policy_v1' },
        carbonReductionPct: 12.4,
        waterImpactDeltaLiters: -1.2,
        latencyMs: { total: 73, compute: 48 },
        estimatedEnergyKwh: 0.6,
      })
    )

    expect(parsed.decisionFrameId).toBe('df_456')
    expect(parsed.action).toBe('deny')
    expect(parsed.policyTrace).toEqual({ policyVersion: 'water_policy_v1' })
    expect(parsed.latencyMs).toEqual({ total: 73, compute: 48 })
    expect(parsed.estimatedEnergyKwh).toBe(0.6)
  })

  it('builds the DEKES decision surface from a canonical decision response', () => {
    const surface = buildDekesDecisionSurface({
      decisionFrameId: 'df_789',
      decision: 'delay',
      decisionMode: 'runtime_authorization',
      selectedRegion: 'eu-west-1',
      selectedRunner: 'ubuntu-eu-west-1',
      reasonCode: 'CARBON_POLICY_DELAY',
      signalConfidence: 0.82,
      notBefore: '2026-04-05T12:00:00.000Z',
      proofHash: 'proof-hash',
      proofRecord: { job_id: 'df_789' },
      policyTrace: { policyVersion: 'water_policy_v1' },
      savings: {
        carbonReductionPct: 18.2,
        waterImpactDeltaLiters: -0.8,
      },
      baseline: {
        carbonIntensity: 420,
      },
      selected: {
        carbonIntensity: 280,
      },
      latencyMs: {
        total: 77,
        compute: 59,
      },
      enforcementBundle: {
        githubActions: {
          executable: true,
          maxParallel: 0,
          environment: 'ecobe-deferred',
          notBefore: '2026-04-05T12:00:00.000Z',
        },
      },
    })

    expect(surface.decisionId).toBe('df_789')
    expect(surface.action).toBe('delay')
    expect(surface.legacyAction).toBe('delay')
    expect(surface.executable).toBe(true)
    expect(surface.carbonDelta).toBe(140)
    expect(surface.artifactLinks?.proofPacketPdf).toBe('/api/v1/ci/decisions/df_789/proof-packet.pdf')
  })

  it('maps handoff posture from canonical action and confidence', () => {
    const eventType = toDekesHandoffEventType({
      action: 'delay',
      fallbackUsed: false,
      lowConfidence: false,
      signalConfidence: 0.74,
      baselineCarbonIntensity: 410,
      selectedCarbonIntensity: 250,
    })

    expect(eventType).toBe('POLICY_DELAY')
    expect(toDekesHandoffSeverity(eventType, 'delay')).toBe('medium')
    expect(toDekesHandoffClassification(eventType)).toBe('informational')
    expect(toDekesHandoffStatus('PROOFED')).toBe('processed')
    expect(toDekesQualityTier(0.74)).toBe('medium')
    expect(
      toDekesForecastStability({
        fallbackUsed: false,
        lowConfidence: false,
        signalConfidence: 0.74,
      })
    ).toBe('medium')
  })
})
