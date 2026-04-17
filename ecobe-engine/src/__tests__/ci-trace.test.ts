import {
  buildTraceHashes,
  finalizeTraceEnvelope,
  verifyTraceChain,
  type TraceEnvelopeRecord,
  type TraceEnvelopeSeed,
} from '../lib/ci/trace'

const traceSeed: TraceEnvelopeSeed = {
  identity: {
    traceId: 'trace:frame-1',
    decisionFrameId: 'frame-1',
    requestId: 'req-1',
    createdAt: '2026-03-28T12:00:00.000Z',
  },
  inputSignals: {
    request: {
      preferredRegions: ['us-west-2'],
    },
    resolvedCandidates: [
      {
        region: 'us-west-2',
        runner: 'ubuntu-latest',
        carbonIntensity: 180,
        carbonObservedAt: '2026-03-28T12:00:00.000Z',
        carbonConfidence: 0.9,
        carbonSourceUsed: 'WATTTIME_MOER',
        carbonFallbackUsed: false,
        signalMode: 'marginal',
        accountingMethod: 'marginal',
        carbonDisagreementFlag: false,
        carbonDisagreementPct: 0,
        waterSignal: {
          region: 'us-west-2',
          waterIntensityLPerKwh: 1.2,
          waterStressIndex: 2.1,
          waterQualityIndex: null,
          droughtRiskIndex: null,
          scarcityFactor: 1.4,
          source: ['aqueduct'],
          datasetVersions: { aqueduct: 'v1' },
          confidence: 0.9,
          fallbackUsed: false,
          dataQuality: 'high',
          signalType: 'average_operational',
          referenceTime: '2026-03-28T12:00:00.000Z',
          authorityMode: 'basin',
          scenario: 'current',
          facilityId: null,
          supplierSet: ['aqueduct'],
          evidenceRefs: ['water:aqueduct:v1'],
          telemetryRef: null,
          artifactGeneratedAt: '2026-03-28T11:30:00.000Z',
        },
        waterImpactLiters: 1.44,
        scarcityImpact: 2.016,
        reliabilityMultiplier: 1,
        score: 12.5,
        defensiblePenalty: 0,
        defensibleReasonCodes: [],
        guardrailCandidateBlocked: false,
        guardrailReasons: [],
        providerSnapshotRef: 'us-west-2:WATTTIME_MOER:2026-03-28T12:00:00.000Z',
        waterAuthority: {
          authorityMode: 'basin',
          scenario: 'current',
          confidence: 0.9,
          supplierSet: ['aqueduct'],
          evidenceRefs: ['water:aqueduct:v1'],
          facilityId: null,
          telemetryRef: null,
          bundleHash: 'bundle-hash',
          manifestHash: 'manifest-hash',
        },
        cacheStatus: 'warm',
        providerResolutionMs: 12,
        carbonFreshnessSec: 0,
        waterFreshnessSec: 1800,
        clusterId: 'NA_BC_HYDRO',
        clusterRole: 'DUMP_ELIGIBLE',
        clusterBiasApplied: -11,
        clusterReason: 'NA_BC_HYDRO bias applied under NEUTRAL doctrine.',
        ensoPhase: 'NEUTRAL',
        structuralModifier: -11,
        temporalWindowQualified: true,
      },
    ],
  },
  normalizedSignals: {
    candidates: [
      {
        region: 'us-west-2',
        score: 12.5,
        carbonIntensity: 180,
        waterStressIndex: 2.1,
        waterImpactLiters: 1.44,
        scarcityImpact: 2.016,
        reliabilityMultiplier: 1,
        defensiblePenalty: 0,
        defensibleReasonCodes: [],
        guardrailBlocked: false,
        guardrailReasons: [],
        cacheStatus: 'warm',
        authorityMode: 'basin',
        signalMode: 'marginal',
        accountingMethod: 'marginal',
        carbonFreshnessSec: 0,
        waterFreshnessSec: 1800,
        fallbackApplied: false,
        clusterId: 'NA_BC_HYDRO',
        clusterRole: 'DUMP_ELIGIBLE',
        clusterBiasApplied: -11,
        clusterReason: 'NA_BC_HYDRO bias applied under NEUTRAL doctrine.',
        ensoPhase: 'NEUTRAL',
        structuralModifier: -11,
        temporalWindowQualified: true,
      },
    ],
  },
  decisionPath: {
    evaluatedRegions: ['us-west-2'],
    rejectedRegions: [],
    selectedRegion: 'us-west-2',
    baselineRegion: 'us-west-2',
    action: 'run_now',
    reasonCode: 'ALLOW',
    operatingMode: 'STANDARD',
    selectedClusterId: 'NA_BC_HYDRO',
    selectedClusterRole: 'DUMP_ELIGIBLE',
    rerouteFrom: null,
    precedenceOverrideApplied: false,
    delayWindow: {
      allowed: true,
      delayMinutes: 15,
      notBefore: null,
      reason: 'delay_allowed',
    },
  },
  governance: {
    label: 'SAIQ',
    source: 'SEKED',
    strict: false,
    constraintsApplied: [],
    policyReferences: ['seked-policy:v1'],
    seked: {
      enabled: true,
      strict: false,
      evaluated: true,
      applied: true,
      hookStatus: 'success',
      reasonCodes: [],
      policyReference: 'seked-policy:v1',
    },
    external: {
      enabled: false,
      strict: false,
      evaluated: false,
      applied: false,
      hookStatus: 'not_configured',
      reasonCodes: [],
      policyReference: null,
    },
  },
  proof: {
    proofHash: 'proof-hash-1',
    datasetReferences: [
      {
        name: 'aqueduct',
        source_url: 'https://example.com/aqueduct',
        file_hash: 'hash-aqueduct',
        downloaded_at: '2026-03-28T11:00:00.000Z',
        dataset_version: 'v1',
      },
    ],
    bundleHash: 'bundle-hash',
    manifestHash: 'manifest-hash',
    artifactMetadata: {
      bundleHash: 'bundle-hash',
      manifestHash: 'manifest-hash',
      bundleGeneratedAt: '2026-03-28T11:00:00.000Z',
      manifestBuiltAt: '2026-03-28T11:00:00.000Z',
      datasetHashesPresent: true,
      sourceCount: 1,
      suppliers: ['aqueduct'],
    },
    providerSnapshotRefs: ['provider-snapshot-1'],
    evidenceRefs: ['water:aqueduct:v1'],
    supplierRefs: ['aqueduct'],
    adapter: {
      runtime: 'http',
      transport: 'sync_http',
      controlPoint: 'gateway_preflight',
      adapterId: 'ecobe.http.decision.v1',
      adapterVersion: '1.0.0',
      enforcementResult: 'applied',
    },
  },
}

function makeRecord(
  sequenceNumber: number,
  previousTraceHash: string | null,
  decisionFrameId: string
): TraceEnvelopeRecord {
  const payload = finalizeTraceEnvelope(
    {
      ...traceSeed,
      identity: {
        ...traceSeed.identity,
        decisionFrameId,
        traceId: `trace:${decisionFrameId}`,
      },
    },
    {
      sequenceNumber,
      totalMs: 42,
      computeMs: 35,
      stageTimings: {
        artifactSnapshotMs: 1,
        candidateEvaluationMs: 10,
        policyHookMs: 2,
        doctrineAssemblyMs: 12,
        traceAssemblyMs: 1,
      },
      providerTimings: [
        {
          region: 'us-west-2',
          latencyMs: 12,
          cacheStatus: 'warm',
          carbonFreshnessSec: 0,
          waterFreshnessSec: 1800,
          stalenessSec: 0,
        },
      ],
      cacheHit: true,
    }
  )
  const hashes = buildTraceHashes(payload, previousTraceHash)
  return {
    sequenceNumber,
    decisionFrameId,
    traceHash: hashes.traceHash,
    previousTraceHash,
    inputSignalHash: hashes.inputSignalHash,
    payload,
    createdAt: '2026-03-28T12:00:00.000Z',
  }
}

describe('ci trace ledger', () => {
  it('produces deterministic hashes and verifies an untampered chain', () => {
    const first = makeRecord(1, null, 'frame-1')
    const second = makeRecord(2, first.traceHash, 'frame-2')

    expect(buildTraceHashes(first.payload, first.previousTraceHash)).toEqual({
      traceHash: first.traceHash,
      inputSignalHash: first.inputSignalHash,
    })
    expect(verifyTraceChain([first, second])).toEqual({
      valid: true,
      errors: [],
    })
  })

  it('fails verification when a trace payload is tampered with', () => {
    const first = makeRecord(1, null, 'frame-1')
    const second = makeRecord(2, first.traceHash, 'frame-2')
    const tampered: TraceEnvelopeRecord = {
      ...second,
      payload: {
        ...second.payload,
        decisionPath: {
          ...second.payload.decisionPath,
          selectedRegion: 'eu-west-1',
        },
      },
    }

    const verification = verifyTraceChain([first, tampered])
    expect(verification.valid).toBe(false)
    expect(verification.errors.some((error) => error.includes('traceHash mismatch'))).toBe(true)
  })
})
