import type {
  AuthorizationAccountingMethod,
  AuthorizationSignalMode,
} from './authorization'
import type {
  SignalFrame,
  GovernanceFrame,
} from './frames'
import type { CanonicalTransportMetadata } from './canonical'
import { sha256Canonical } from '../proof/export-chain'
import type {
  WaterArtifactMetadata,
  WaterAuthority,
  WaterManifestDataset,
  WaterSignal,
} from '../water/types'
import type { DecisionExplanation, DecisionTrust, WorkloadClass } from './doctrine'

export interface ResolvedCandidateOverride {
  region: string
  runner: string
  carbonIntensity: number
  carbonConfidence: number
  carbonSourceUsed: string
  carbonFallbackUsed: boolean
  signalMode: AuthorizationSignalMode
  accountingMethod: AuthorizationAccountingMethod
  carbonDisagreementFlag: boolean
  carbonDisagreementPct: number
  waterSignal: WaterSignal
  waterImpactLiters: number
  scarcityImpact: number
  reliabilityMultiplier: number
  score: number
  defensiblePenalty: number
  defensibleReasonCodes: string[]
  guardrailCandidateBlocked: boolean
  guardrailReasons: string[]
  providerSnapshotRef: string
  waterAuthority: WaterAuthority
  cacheStatus: 'live' | 'warm' | 'redis' | 'lkg' | 'degraded-safe'
  providerResolutionMs: number
  carbonFreshnessSec: number | null
  waterFreshnessSec: number | null
}

export interface TraceStageTimings {
  artifactSnapshotMs: number
  candidateEvaluationMs: number
  policyHookMs: number
  doctrineAssemblyMs: number
  traceAssemblyMs: number
}

export interface TraceProviderTiming {
  region: string
  latencyMs: number
  cacheStatus: 'live' | 'warm' | 'redis' | 'lkg' | 'degraded-safe'
  carbonFreshnessSec: number | null
  waterFreshnessSec: number | null
  stalenessSec: number | null
}

export type GovernanceSource = 'NONE' | string

export interface TraceEnvelopeSeed {
  identity: {
    traceId: string
    decisionFrameId: string
    requestId: string
    createdAt: string
  }
  inputSignals: {
    request: Record<string, unknown>
    resolvedCandidates: ResolvedCandidateOverride[]
  }
  normalizedSignals: {
    candidates: Array<{
      region: string
      score: number
      carbonIntensity: number
      waterStressIndex: number
      waterImpactLiters: number
      scarcityImpact: number
      reliabilityMultiplier: number
      defensiblePenalty: number
      defensibleReasonCodes: string[]
      guardrailBlocked: boolean
      guardrailReasons: string[]
      cacheStatus: 'live' | 'warm' | 'redis' | 'lkg' | 'degraded-safe'
      authorityMode: WaterAuthority['authorityMode']
      signalMode: AuthorizationSignalMode
      accountingMethod: AuthorizationAccountingMethod
      carbonFreshnessSec: number | null
      waterFreshnessSec: number | null
      fallbackApplied: boolean
    }>
  }
  signalFrame: SignalFrame
  governanceFrame: GovernanceFrame
  decisionPath: {
    evaluatedRegions: string[]
    rejectedRegions: Array<{
      region: string
      reasonCodes: string[]
    }>
    selectedRegion: string
    baselineRegion: string
    action: string
    reasonCode: string
    workloadClass: WorkloadClass
    operatingMode: string
    rerouteFrom: string | null
    precedenceOverrideApplied: boolean
    delayWindow: {
      allowed: boolean
      delayMinutes: number | null
      notBefore: string | null
      reason: string
    }
  }
  explanation: Pick<
    DecisionExplanation,
    | 'whyAction'
    | 'whyTarget'
    | 'dominantConstraint'
    | 'policyPrecedence'
    | 'rejectedAlternatives'
    | 'counterfactualCondition'
    | 'uncertaintySummary'
  >
  trust: {
    providerTrustTier: DecisionTrust['providerTrust']['providerTrustTier']
    replayabilityStatus: DecisionTrust['replayability']['status']
    fallbackEngaged: boolean
    degraded: boolean
    degradedReasons: string[]
    estimatedFields: string[]
  }
  governance: {
    label: 'SAIQ'
    source: GovernanceSource
    strict: boolean
    score?: number | null
    zone?: 'green' | 'amber' | 'red' | null
    weights?: {
      carbon: number | null
      water: number | null
      latency: number | null
      cost: number | null
    } | null
    thresholds?: Record<string, number | null> | null
    constraintsApplied: string[]
    policyReferences: string[]
    seked: {
      enabled: boolean
      strict: boolean
      evaluated: boolean
      applied: boolean
      hookStatus: string
      reasonCodes: string[]
      policyReference: string | null
    }
    external: {
      enabled: boolean
      strict: boolean
      evaluated: boolean
      applied: boolean
      hookStatus: string
      reasonCodes: string[]
      policyReference: string | null
    }
  }
  proof: {
    proofHash: string
    datasetReferences: WaterManifestDataset[]
    bundleHash: string | null
    manifestHash: string | null
    artifactMetadata: WaterArtifactMetadata
    providerSnapshotRefs: string[]
    evidenceRefs: string[]
    supplierRefs: string[]
    adapter: CanonicalTransportMetadata
  }
}

export interface TraceEnvelope extends TraceEnvelopeSeed {
  identity: TraceEnvelopeSeed['identity'] & {
    sequenceNumber: number
  }
  performance: {
    totalMs: number | null
    computeMs: number | null
    stageTimings: TraceStageTimings
    providerTimings: TraceProviderTiming[]
    cacheHit: boolean
  }
}

export interface TraceEnvelopeRecord {
  sequenceNumber: number
  decisionFrameId: string
  traceHash: string
  previousTraceHash: string | null
  inputSignalHash: string
  payload: TraceEnvelope
  createdAt: string
}

export function deriveGovernanceSource(input: {
  sekedApplied: boolean
  externalApplied: boolean
  sekedSource?: string | null
  externalSource?: string | null
}): GovernanceSource {
  const sources = [
    input.sekedApplied ? input.sekedSource ?? 'SEKED' : null,
    input.externalApplied ? input.externalSource ?? 'EXTERNAL' : null,
  ].filter((value): value is string => Boolean(value))

  if (sources.length > 0) return sources.join('+')
  return 'NONE'
}

export function finalizeTraceEnvelope(
  seed: TraceEnvelopeSeed,
  input: {
    sequenceNumber: number
    totalMs: number | null
    computeMs: number | null
    stageTimings: TraceStageTimings
    providerTimings: TraceProviderTiming[]
    cacheHit: boolean
  }
): TraceEnvelope {
  return {
    ...seed,
    identity: {
      ...seed.identity,
      sequenceNumber: input.sequenceNumber,
    },
    performance: {
      totalMs: input.totalMs,
      computeMs: input.computeMs,
      stageTimings: input.stageTimings,
      providerTimings: input.providerTimings,
      cacheHit: input.cacheHit,
    },
  }
}

export function buildInputSignalHash(inputSignals: TraceEnvelope['inputSignals']): string {
  return sha256Canonical(inputSignals)
}

export function buildTraceHashes(payload: TraceEnvelope, previousTraceHash: string | null) {
  return {
    inputSignalHash: buildInputSignalHash(payload.inputSignals),
    traceHash: sha256Canonical({
      previousTraceHash,
      payload,
    }),
  }
}

export function buildCuratedTraceEnvelopeView(record: TraceEnvelopeRecord) {
  return {
    decisionFrameId: record.decisionFrameId,
    sequenceNumber: record.sequenceNumber,
    traceHash: record.traceHash,
    previousTraceHash: record.previousTraceHash,
    inputSignalHash: record.inputSignalHash,
    traceAvailable: true,
    governanceSource: record.payload.governance.source,
    governanceZone: record.payload.governanceFrame.zone,
    governanceScore: record.payload.governanceFrame.score,
    governanceStrict: record.payload.governanceFrame.strict,
    policyReference: record.payload.governanceFrame.policyReference,
    action: record.payload.decisionPath.action,
    reasonCode: record.payload.decisionPath.reasonCode,
    selectedRegion: record.payload.decisionPath.selectedRegion,
    workloadClass: record.payload.decisionPath.workloadClass,
    operatingMode: record.payload.decisionPath.operatingMode,
    dominantConstraint: record.payload.explanation.dominantConstraint,
    providerTrustTier: record.payload.trust.providerTrustTier,
    replayabilityStatus: record.payload.trust.replayabilityStatus,
    proofHash: record.payload.proof.proofHash,
    signalFrameId: record.payload.signalFrame.signalFrameId,
    sourceClass: record.payload.signalFrame.sourceClass,
    cacheStatus: record.payload.signalFrame.cacheStatus,
    qualityTier: record.payload.signalFrame.qualityTier,
    mirrorStatus: record.payload.signalFrame.mirrorState.status,
    lease: record.payload.governanceFrame.lease,
    totalMs: record.payload.performance.totalMs,
    computeMs: record.payload.performance.computeMs,
    cacheHit: record.payload.performance.cacheHit,
    createdAt: record.createdAt,
  }
}

export function verifyTraceChain(records: TraceEnvelopeRecord[]) {
  const errors: string[] = []

  for (let index = 0; index < records.length; index += 1) {
    const current = records[index]
    const previous = index > 0 ? records[index - 1] : null
    const expectedPreviousHash = previous?.traceHash ?? null

    if (current.previousTraceHash !== expectedPreviousHash) {
      errors.push(`previousTraceHash mismatch at sequence ${current.sequenceNumber}`)
    }

    const hashes = buildTraceHashes(current.payload, current.previousTraceHash)
    if (hashes.inputSignalHash !== current.inputSignalHash) {
      errors.push(`inputSignalHash mismatch at sequence ${current.sequenceNumber}`)
    }
    if (hashes.traceHash !== current.traceHash) {
      errors.push(`traceHash mismatch at sequence ${current.sequenceNumber}`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
