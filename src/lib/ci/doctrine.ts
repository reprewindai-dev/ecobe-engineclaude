import type { RoutingSignal } from '../carbon/provider-router'
import { sha256Canonical } from '../proof/export-chain'
import type { WaterAuthority, WaterDecisionAction, WaterPolicyProfile, WaterSignal } from '../water/types'

export const DECISION_DOCTRINE_VERSION = 'co2_router_doctrine_v1'

export const DETERMINISTIC_CONFLICT_HIERARCHY = [
  'policy_hard_override',
  'water_guardrail',
  'latency_sla_protection',
  'carbon_optimization_within_allowed_envelope',
  'cost_tie_breaker',
] as const

export type DeterministicConflictLayer = (typeof DETERMINISTIC_CONFLICT_HIERARCHY)[number]

export type CandidateExplanation = {
  region: string
  reason: string
}

export type CandidateLike = {
  region: string
  score: number
  carbonIntensity: number
  carbonSourceUsed: string
  carbonDisagreementFlag: boolean
  carbonDisagreementPct: number
  carbonFallbackUsed: boolean
  waterSignal: WaterSignal
  waterImpactLiters: number
  scarcityImpact: number
  guardrailCandidateBlocked: boolean
  guardrailReasons: string[]
  providerSnapshotRef: string
  waterAuthority: WaterAuthority
}

export interface AssuranceStatus {
  operationallyUsable: boolean
  assuranceReady: boolean
  status: 'operational' | 'assurance_ready' | 'degraded'
  issues: string[]
}

export type MSSHealthState = 'HEALTHY' | 'DEGRADED' | 'FAILED'

export interface MSSState {
  snapshotId: string
  carbonProvider: string
  carbonProviderHealth: MSSHealthState
  waterAuthorityHealth: MSSHealthState
  carbonFreshnessSec: number | null
  waterFreshnessSec: number | null
  cacheStatus: 'live' | 'warm' | 'redis' | 'lkg' | 'degraded-safe'
  disagreement: {
    flag: boolean
    pct: number
  }
  lastKnownGoodApplied: boolean
  carbonLineage: string[]
  waterLineage: string[]
}

export interface DecisionExplanation {
  hierarchy: readonly DeterministicConflictLayer[]
  whyAction: string
  whyTarget: string
  dominantConstraint: string
  policyPrecedence: string[]
  rejectedAlternatives: CandidateExplanation[]
  counterfactualCondition: string
  uncertaintySummary: string
}

export type WorkloadClass =
  | 'batch'
  | 'interactive'
  | 'critical'
  | 'regulated'
  | 'emergency'

export interface DecisionTrust {
  signalFreshness: {
    carbonFreshnessSec: number | null
    waterFreshnessSec: number | null
    freshnessSummary: string
  }
  providerTrust: {
    carbonProvider: string
    carbonProviderHealth: MSSHealthState
    waterAuthorityHealth: MSSHealthState
    providerTrustTier: 'high' | 'medium' | 'guarded'
  }
  disagreement: {
    present: boolean
    pct: number
    summary: string
  }
  estimatedFields: {
    present: boolean
    fields: string[]
  }
  replayability: {
    status: 'replayable' | 'degraded' | 'local_only'
    summary: string
  }
  fallbackMode: {
    engaged: boolean
    summary: string
  }
  degradedState: {
    degraded: boolean
    reasons: string[]
    summary: string
  }
}

export function resolveBaselineCandidate<T extends { region: string }>(
  preferredRegions: string[],
  candidates: T[],
  selected: T
): T {
  for (const preferredRegion of preferredRegions) {
    const match = candidates.find((candidate) => candidate.region === preferredRegion)
    if (match) return match
  }
  return selected
}

export function buildAssuranceStatus(input: {
  datasetHashesPresent: boolean
  bundleHealthy: boolean
  manifestHealthy: boolean
  waterFallbackUsed: boolean
  carbonFallbackUsed: boolean
  manifestDatasets: Array<{ name: string; file_hash: string | null | undefined }>
}): AssuranceStatus {
  const issues: string[] = []
  const unhashedDatasets = input.manifestDatasets
    .filter((dataset) => !dataset.file_hash || dataset.file_hash === 'unverified')
    .map((dataset) => dataset.name)

  if (!input.bundleHealthy || !input.manifestHealthy) {
    issues.push('water_artifacts_not_healthy')
  }
  if (unhashedDatasets.length > 0) {
    issues.push(`water_dataset_hashes_unverified:${unhashedDatasets.join(',')}`)
  }
  if (input.waterFallbackUsed) {
    issues.push('water_authority_in_fallback_mode')
  }
  if (input.carbonFallbackUsed) {
    issues.push('carbon_signal_in_fallback_mode')
  }

  const operationallyUsable = input.bundleHealthy && input.manifestHealthy
  const assuranceReady = operationallyUsable && input.datasetHashesPresent && !input.waterFallbackUsed && !input.carbonFallbackUsed

  return {
    operationallyUsable,
    assuranceReady,
    status: assuranceReady ? 'assurance_ready' : operationallyUsable ? 'operational' : 'degraded',
    issues,
  }
}

function resolveHealthState(input: {
  confidence: number
  fallbackUsed: boolean
  disagreementPct?: number
  freshnessSec: number | null
  staleAfterSec: number
}): MSSHealthState {
  if (input.fallbackUsed) return 'FAILED'
  if (input.freshnessSec === null) return 'DEGRADED'
  if (input.freshnessSec > input.staleAfterSec) return 'FAILED'
  if (input.confidence < 0.6) return 'DEGRADED'
  if ((input.disagreementPct ?? 0) > 15) return 'DEGRADED'
  return 'HEALTHY'
}

export function buildMssState(input: {
  candidate: CandidateLike
  assurance: AssuranceStatus
  carbonFreshnessSec: number | null
  waterFreshnessSec: number | null
  cacheStatus: 'live' | 'warm' | 'redis' | 'lkg' | 'degraded-safe'
}): MSSState {
  const snapshotId = sha256Canonical({
    providerSnapshotRef: input.candidate.providerSnapshotRef,
    bundleHash: input.candidate.waterAuthority.bundleHash,
    manifestHash: input.candidate.waterAuthority.manifestHash,
    authorityMode: input.candidate.waterAuthority.authorityMode,
    scenario: input.candidate.waterAuthority.scenario,
  })

  return {
    snapshotId,
    carbonProvider: input.candidate.carbonSourceUsed,
    carbonProviderHealth: resolveHealthState({
      confidence: input.candidate.carbonFallbackUsed ? 0.05 : 0.85,
      fallbackUsed: input.candidate.carbonFallbackUsed,
      disagreementPct: input.candidate.carbonDisagreementPct,
      freshnessSec: input.carbonFreshnessSec,
      staleAfterSec: 900,
    }),
    waterAuthorityHealth: resolveHealthState({
      confidence: input.candidate.waterSignal.confidence,
      fallbackUsed: input.candidate.waterSignal.fallbackUsed || !input.assurance.operationallyUsable,
      freshnessSec: input.waterFreshnessSec,
      staleAfterSec: 172800,
    }),
    carbonFreshnessSec: input.carbonFreshnessSec,
    waterFreshnessSec: input.waterFreshnessSec,
    cacheStatus: input.cacheStatus,
    disagreement: {
      flag: input.candidate.carbonDisagreementFlag,
      pct: Number(input.candidate.carbonDisagreementPct.toFixed(3)),
    },
    lastKnownGoodApplied:
      ['warm', 'redis', 'lkg', 'degraded-safe'].includes(input.cacheStatus) ||
      input.candidate.carbonFallbackUsed ||
      input.candidate.waterSignal.fallbackUsed,
    carbonLineage: Array.from(new Set([input.candidate.carbonSourceUsed, input.candidate.providerSnapshotRef])),
    waterLineage: Array.from(new Set(input.candidate.waterAuthority.evidenceRefs)),
  }
}

export function buildDecisionExplanation(input: {
  decision: WaterDecisionAction
  reasonCode: string
  selected: CandidateLike
  baseline: CandidateLike
  candidates: CandidateLike[]
  profile: WaterPolicyProfile
  workloadClass: WorkloadClass
}): DecisionExplanation {
  const rejectedAlternatives = input.candidates
    .filter((candidate) => candidate.region !== input.selected.region)
    .slice(0, 6)
    .map((candidate) => {
      if (candidate.guardrailCandidateBlocked) {
        return {
          region: candidate.region,
          reason: `Rejected by water guardrail (${candidate.guardrailReasons.join(', ')})`,
        }
      }
      if (candidate.score > input.selected.score) {
        return {
          region: candidate.region,
          reason: `Higher deterministic score (${candidate.score.toFixed(3)}) than selected target ${input.selected.region}.`,
        }
      }
      if (candidate.carbonDisagreementFlag) {
        return {
          region: candidate.region,
          reason: `Lower defensibility due to provider disagreement (${candidate.carbonDisagreementPct.toFixed(1)}%).`,
        }
      }
      return {
        region: candidate.region,
        reason: 'Not selected after deterministic hierarchy evaluation.',
      }
    })

  const actionMap: Record<WaterDecisionAction, string> = {
    run_now: `Allowed immediately because ${input.selected.region} stayed within policy, water, and SLA constraints under the ${input.profile} doctrine.`,
    reroute: `Rerouted because the selected target offered the safest allowed envelope before execution while preserving binding policy constraints.`,
    delay: `Delayed because no safe immediate execution path beat the active doctrine and delaying preserved environmental and policy integrity.`,
    throttle: `Throttled because the workload remained protected for execution but required a lower-intensity posture under active constraints.`,
    deny: `Denied because the request could not satisfy mandatory pre-execution doctrine without breaching policy or environmental constraints.`,
  }

  const whyTarget =
    input.selected.region === input.baseline.region
      ? `${input.selected.region} remained the default and selected target because no allowed alternative beat it on deterministic score.`
      : `${input.selected.region} beat baseline ${input.baseline.region} after policy, water, latency/SLA, carbon, and cost were evaluated in fixed order.`

  const dominantConstraint =
    input.reasonCode.includes('POLICY') || input.reasonCode.includes('DENY')
      ? 'policy_hard_override'
      : input.reasonCode.includes('WATER') || input.reasonCode.includes('DROUGHT')
        ? 'water_guardrail'
        : input.reasonCode.includes('THROTTLE') || input.reasonCode.includes('CRITICAL')
          ? 'latency_sla_protection'
          : input.reasonCode.includes('REROUTE')
            ? 'carbon_optimization_within_allowed_envelope'
            : 'cost_tie_breaker'

  const counterfactualCondition =
    input.decision === 'run_now'
      ? `The action would change only if policy, water, or SLA posture weakened enough to block ${input.selected.region}.`
      : input.decision === 'reroute'
        ? `The engine would have stayed on ${input.baseline.region} if it remained admissible and beat ${input.selected.region} on deterministic score.`
        : input.decision === 'delay'
          ? `The job can run once a candidate clears policy and water guardrails inside the allowed delay window for ${input.workloadClass} workloads.`
          : input.decision === 'throttle'
            ? `The throttle would relax once the workload regains an admissible low-pressure path without breaching protected constraints.`
            : `The denial would lift only after the request satisfies policy, water, and runtime posture together.`

  const uncertaintySummaryParts: string[] = []
  if (input.selected.carbonFallbackUsed) {
    uncertaintySummaryParts.push('carbon signal is on fallback posture')
  }
  if (input.selected.waterSignal.fallbackUsed || input.selected.waterAuthority.authorityMode === 'fallback') {
    uncertaintySummaryParts.push('water authority is degraded or on fallback')
  }
  if (input.selected.carbonDisagreementFlag) {
    uncertaintySummaryParts.push(
      `provider disagreement is present at ${input.selected.carbonDisagreementPct.toFixed(1)}%`
    )
  }
  if (uncertaintySummaryParts.length === 0) {
    uncertaintySummaryParts.push('no material trust degradation was present on the selected path')
  }

  return {
    hierarchy: DETERMINISTIC_CONFLICT_HIERARCHY,
    whyAction: `${actionMap[input.decision]} Reason code: ${input.reasonCode}.`,
    whyTarget,
    dominantConstraint,
    policyPrecedence: [...DETERMINISTIC_CONFLICT_HIERARCHY],
    rejectedAlternatives,
    counterfactualCondition,
    uncertaintySummary: uncertaintySummaryParts.join('; '),
  }
}

export function normalizeWorkloadClass(input: {
  workloadClass?: string | null
  criticality: 'critical' | 'standard' | 'batch'
  jobType: 'standard' | 'heavy' | 'light'
  metadata?: Record<string, unknown> | undefined
}): WorkloadClass {
  const explicit = input.workloadClass?.trim().toLowerCase()
  if (
    explicit === 'batch' ||
    explicit === 'interactive' ||
    explicit === 'critical' ||
    explicit === 'regulated' ||
    explicit === 'emergency'
  ) {
    return explicit
  }

  const metadataClass =
    typeof input.metadata?.['workloadClass'] === 'string'
      ? String(input.metadata.workloadClass).trim().toLowerCase()
      : null

  if (
    metadataClass === 'batch' ||
    metadataClass === 'interactive' ||
    metadataClass === 'critical' ||
    metadataClass === 'regulated' ||
    metadataClass === 'emergency'
  ) {
    return metadataClass
  }

  if (input.criticality === 'critical' && input.jobType === 'heavy') return 'emergency'
  if (input.criticality === 'critical') return 'critical'
  if (input.criticality === 'batch') return 'batch'
  if (input.jobType === 'light') return 'interactive'
  return 'interactive'
}

function toTrustTier(input: {
  assurance: AssuranceStatus
  mss: MSSState
  fallbackUsed: boolean
}): 'high' | 'medium' | 'guarded' {
  if (input.fallbackUsed || input.assurance.status === 'degraded') return 'guarded'
  if (
    input.mss.carbonProviderHealth !== 'HEALTHY' ||
    input.mss.waterAuthorityHealth !== 'HEALTHY' ||
    input.mss.disagreement.flag
  ) {
    return 'medium'
  }
  return 'high'
}

export function buildDecisionTrust(input: {
  selected: CandidateLike
  assurance: AssuranceStatus
  mss: MSSState
  fallbackUsed: boolean
  idempotencyReplayed?: boolean
  persisted?: boolean
  workloadClass: WorkloadClass
}): DecisionTrust {
  const estimatedFields = [
    input.selected.carbonFallbackUsed ? 'carbon_intensity' : null,
    input.selected.waterSignal.fallbackUsed ? 'water_signal' : null,
    input.selected.waterAuthority.authorityMode === 'fallback' ? 'water_authority' : null,
    input.selected.carbonDisagreementFlag ? 'carbon_disagreement_penalty' : null,
  ].filter((value): value is string => Boolean(value))

  const degradedReasons = [
    input.fallbackUsed ? 'fallback_mode_engaged' : null,
    input.assurance.status === 'degraded' ? 'assurance_degraded' : null,
    input.mss.carbonProviderHealth !== 'HEALTHY' ? 'carbon_provider_not_healthy' : null,
    input.mss.waterAuthorityHealth !== 'HEALTHY' ? 'water_authority_not_healthy' : null,
    input.mss.disagreement.flag ? 'provider_disagreement_present' : null,
    input.workloadClass === 'regulated' && input.fallbackUsed ? 'regulated_workload_cannot_silently_degrade' : null,
  ].filter((value): value is string => Boolean(value))

  const freshnessSummary = [
    input.mss.carbonFreshnessSec != null
      ? `carbon freshness ${input.mss.carbonFreshnessSec}s`
      : 'carbon freshness unavailable',
    input.mss.waterFreshnessSec != null
      ? `water freshness ${input.mss.waterFreshnessSec}s`
      : 'water freshness unavailable',
  ].join('; ')

  return {
    signalFreshness: {
      carbonFreshnessSec: input.mss.carbonFreshnessSec,
      waterFreshnessSec: input.mss.waterFreshnessSec,
      freshnessSummary,
    },
    providerTrust: {
      carbonProvider: input.mss.carbonProvider,
      carbonProviderHealth: input.mss.carbonProviderHealth,
      waterAuthorityHealth: input.mss.waterAuthorityHealth,
      providerTrustTier: toTrustTier({
        assurance: input.assurance,
        mss: input.mss,
        fallbackUsed: input.fallbackUsed,
      }),
    },
    disagreement: {
      present: input.mss.disagreement.flag,
      pct: input.mss.disagreement.pct,
      summary: input.mss.disagreement.flag
        ? `Provider disagreement detected at ${input.mss.disagreement.pct.toFixed(1)}%.`
        : 'No material provider disagreement detected.',
    },
    estimatedFields: {
      present: estimatedFields.length > 0,
      fields: estimatedFields,
    },
    replayability: {
      status: input.persisted ? 'replayable' : input.idempotencyReplayed ? 'degraded' : 'local_only',
      summary: input.persisted
        ? 'Decision frame is persisted with replay-ready metadata.'
        : input.idempotencyReplayed
          ? 'Decision response was replayed from idempotency cache and may not include a persisted trace frame.'
          : 'Decision is local-only until persistence succeeds.',
    },
    fallbackMode: {
      engaged: input.fallbackUsed,
      summary: input.fallbackUsed
        ? 'Fallback or degraded-safe signal mode influenced the selected decision path.'
        : 'No fallback posture was required on the selected path.',
    },
    degradedState: {
      degraded: degradedReasons.length > 0,
      reasons: degradedReasons,
      summary:
        degradedReasons.length > 0
          ? `Trust posture is degraded: ${degradedReasons.join(', ')}.`
          : 'Trust posture is healthy for the selected decision path.',
    },
  }
}

export function deriveSourceMode(input: {
  decisionMode: 'runtime_authorization' | 'scenario_planning'
  fallbackUsed: boolean
}): 'live' | 'simulation' | 'degraded' {
  if (input.decisionMode === 'scenario_planning') return 'simulation'
  if (input.fallbackUsed) return 'degraded'
  return 'live'
}

export function deriveSignalLineage(input: {
  signal: RoutingSignal
  waterSignal: WaterSignal
}): string[] {
  return Array.from(
    new Set([
      input.signal.provenance.sourceUsed,
      ...input.signal.provenance.contributingSources,
      ...input.waterSignal.source,
    ])
  )
}
