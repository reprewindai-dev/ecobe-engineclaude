import {
  buildDecisionProofPacket,
  buildReplayProofPacket,
  renderDecisionProofPacketPdf,
} from '../lib/ci/proof-packets'

describe('ci proof packet exports', () => {
  const storedResponse = {
    decisionFrameId: 'frame-123',
    workloadClass: 'regulated',
    decision: 'reroute',
    decisionMode: 'runtime_authorization',
    reasonCode: 'SEKED_POLICY_REROUTE',
    selectedRegion: 'us-west-2',
    selectedRunner: 'ubuntu-latest',
    operatingMode: 'NORMAL',
    baseline: {
      region: 'us-east-1',
      carbonIntensity: 540,
      waterImpactLiters: 4.2,
      waterScarcityImpact: 2.3,
    },
    selected: {
      region: 'us-west-2',
      carbonIntensity: 180,
      waterImpactLiters: 2.9,
      waterScarcityImpact: 1.2,
    },
    decisionExplanation: {
      whyAction: 'Rerouted because the selected target offered the safest allowed envelope.',
      whyTarget: 'us-west-2 beat baseline us-east-1 after fixed-order evaluation.',
      dominantConstraint: 'policy_hard_override',
      policyPrecedence: ['policy_hard_override', 'water_guardrail'],
      rejectedAlternatives: [{ region: 'us-east-1', reason: 'Higher deterministic score.' }],
      counterfactualCondition: 'The engine would have stayed on baseline if it remained admissible.',
      uncertaintySummary: 'Provider disagreement present at 12.4%.',
    },
    decisionTrust: {
      signalFreshness: {
        carbonFreshnessSec: 26,
        waterFreshnessSec: 91,
        freshnessSummary: 'carbon freshness 26s; water freshness 91s',
      },
      providerTrust: {
        carbonProvider: 'WATTTIME_MOER',
        carbonProviderHealth: 'HEALTHY',
        waterAuthorityHealth: 'HEALTHY',
        providerTrustTier: 'medium',
      },
      disagreement: {
        present: true,
        pct: 12.4,
        summary: 'Provider disagreement detected at 12.4%.',
      },
      estimatedFields: {
        present: false,
        fields: [],
      },
      replayability: {
        status: 'replayable',
        summary: 'Decision frame is persisted with replay-ready metadata.',
      },
      fallbackMode: {
        engaged: false,
        summary: 'No fallback posture was required on the selected path.',
      },
      degradedState: {
        degraded: false,
        reasons: [],
        summary: 'Trust posture is healthy for the selected decision path.',
      },
    },
    policyTrace: {
      profile: 'default',
      policyVersion: 'water_policy_v1',
      reasonCodes: ['SEKED_POLICY_REROUTE'],
    },
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
      carbonLineage: ['WATTTIME_MOER'],
      waterLineage: ['aqueduct_2_1'],
    },
    proofHash: 'proof-hash',
    proofRecord: {
      proof_hash: 'proof-hash',
    },
    decisionEnvelope: {
      transport: {
        runtime: 'github_actions',
      },
    },
    proofEnvelope: {
      posture: 'assurance_ready',
    },
  }

  it('builds a decision proof packet with explanation, trust, and replay state', () => {
    const packet = buildDecisionProofPacket({
      storedResponse,
      traceRecord: {
        decisionFrameId: 'frame-123',
        sequenceNumber: 3,
        traceHash: 'trace-hash',
        previousTraceHash: 'trace-prev',
        inputSignalHash: 'input-hash',
        createdAt: '2026-04-01T12:00:00.000Z',
        payload: {} as any,
      },
      replay: {
        decisionFrameId: 'frame-123',
        replayedAt: '2026-04-01T12:10:00.000Z',
        deterministicMatch: true,
        traceBacked: true,
        mismatches: [],
        persistedResponse: storedResponse,
        replayedResponse: storedResponse,
      },
    })

    expect(packet.workloadClass).toBe('regulated')
    expect(packet.explanation.dominantConstraint).toBe('policy_hard_override')
    expect(packet.trust.providerTrust.providerTrustTier).toBe('medium')
    expect(packet.hashes.traceHash).toBe('trace-hash')
    expect(packet.replay.deterministicMatch).toBe(true)
  })

  it('builds a replay proof packet', () => {
    const packet = buildReplayProofPacket({
      decisionFrameId: 'frame-123',
      replayedAt: '2026-04-01T12:10:00.000Z',
      deterministicMatch: false,
      traceBacked: true,
      mismatches: ['reasonCode'],
      persistedResponse: storedResponse,
      replayedResponse: { ...storedResponse, reasonCode: 'OTHER_REASON' },
    })

    expect(packet.type).toBe('replay_proof_packet')
    expect(packet.mismatches).toEqual(['reasonCode'])
  })

  it('renders an operational PDF packet', async () => {
    const packet = buildDecisionProofPacket({
      storedResponse,
      traceRecord: null,
      replay: null,
    })

    const pdf = await renderDecisionProofPacketPdf(packet)
    expect(Buffer.isBuffer(pdf)).toBe(true)
    expect(pdf.length).toBeGreaterThan(500)
  })
})
