import type {
  AuthorizationAccountingMethod,
  AuthorizationSignalMode,
} from './authorization'
import type { RoutingCacheSource } from '../carbon/provider-router'
import type { WaterAuthority } from '../water/types'

export type SignalFrameCacheStatus = RoutingCacheSource
export type SignalFrameSourceClass =
  | 'official_live'
  | 'mirrored_truth'
  | 'fallback_truth'
  | 'degraded_safe'
export type SignalQualityTier = 'high' | 'medium' | 'low'

export interface SignalFrame {
  signalFrameId: string
  decisionFrameId: string
  selectedRegion: string
  selectedRunner: string
  sourceClass: SignalFrameSourceClass
  cacheStatus: SignalFrameCacheStatus
  qualityTier: SignalQualityTier
  mirrorState: {
    status: 'live' | 'mirrored' | 'fallback'
    mirroredTruth: boolean
    revisionState: 'stable' | 'pending_reconciliation' | 'fallback_only'
    reconciliationLagSec: number | null
  }
  carbon: {
    intensity: number
    confidence: number
    sourceUsed: string
    contributingSources: string[]
    signalMode: AuthorizationSignalMode
    accountingMethod: AuthorizationAccountingMethod
    freshnessSec: number | null
    disagreementFlag: boolean
    disagreementPct: number
    fallbackUsed: boolean
    referenceTime: string
    fetchedAt: string
  }
  water: {
    authorityMode: WaterAuthority['authorityMode']
    scenario: WaterAuthority['scenario']
    confidence: number
    stressIndex: number
    impactLiters: number
    scarcityImpact: number
    fallbackUsed: boolean
    freshnessSec: number | null
    supplierSet: string[]
    evidenceRefs: string[]
    facilityId: string | null
  }
  latency: {
    bottleneckScore: number | null
    providerResolutionMs: number
  }
  cost: {
    selectedCandidateScore: number
  }
  confidence: {
    signalConfidence: number
    lowestDefensibleSignal: boolean
    defensiblePenalty: number
    defensibleReasonCodes: string[]
  }
  provenance: {
    providerSnapshotRef: string
    policyReferenceCandidates: string[]
  }
}

export interface GovernanceFrame {
  governanceFrameId: string
  decisionFrameId: string
  frameworkLabel: 'SAIQ'
  source: string
  strict: boolean
  zone: 'green' | 'amber' | 'red'
  score: number
  weights: {
    carbon: number | null
    water: number | null
    latency: number | null
    cost: number | null
  }
  thresholds: Record<string, number | null>
  triggers: {
    red: string[]
    amber: string[]
    all: string[]
  }
  constraintsApplied: string[]
  policyReference: string | null
  policyReferences: string[]
  fallbackUsed: boolean
  precedenceOverrideApplied: boolean
  lease: {
    lease_id: string
    lease_expires_at: string
    must_revalidate_after: string
    leaseMinutes: number
  } | null
}

export function classifySignalQualityTier(
  signalConfidence: number,
  fallbackUsed: boolean
): SignalQualityTier {
  if (fallbackUsed || signalConfidence < 0.6) return 'low'
  if (signalConfidence < 0.8) return 'medium'
  return 'high'
}

export function deriveSignalFrameSourceClass(input: {
  sourceUsed: string
  fallbackUsed: boolean
  cacheStatus: SignalFrameCacheStatus
}): SignalFrameSourceClass {
  if (input.cacheStatus === 'degraded-safe') return 'degraded_safe'
  if (input.fallbackUsed) return 'fallback_truth'

  const sourceUsed = input.sourceUsed.toUpperCase()
  if (
    sourceUsed.startsWith('EIA930') ||
    sourceUsed.startsWith('WATTTIME') ||
    sourceUsed.startsWith('GB_') ||
    sourceUsed.startsWith('DK_') ||
    sourceUsed.startsWith('FI_')
  ) {
    return 'official_live'
  }

  return 'mirrored_truth'
}

export function buildSignalFrame(input: {
  decisionFrameId: string
  selectedRegion: string
  selectedRunner: string
  signalConfidence: number
  candidate: {
    runner: string
    region: string
    carbonIntensity: number
    carbonConfidence: number
    carbonSourceUsed: string
    carbonFallbackUsed: boolean
    signalMode: AuthorizationSignalMode
    accountingMethod: AuthorizationAccountingMethod
    carbonDisagreementFlag: boolean
    carbonDisagreementPct: number
    waterSignal: {
      waterStressIndex: number
      scenario: WaterAuthority['scenario']
      confidence: number
      fallbackUsed?: boolean
    }
    waterImpactLiters: number
    scarcityImpact: number
    score: number
    defensiblePenalty: number
    defensibleReasonCodes: string[]
    providerSnapshotRef: string
    waterAuthority: WaterAuthority
    cacheStatus: SignalFrameCacheStatus
    providerResolutionMs: number
    carbonFreshnessSec: number | null
    waterFreshnessSec: number | null
  }
  bottleneckScore: number | null
  policyReferenceCandidates: string[]
}): SignalFrame {
  const fallbackUsed =
    input.candidate.carbonFallbackUsed ||
    Boolean(input.candidate.waterSignal.fallbackUsed) ||
    input.candidate.waterAuthority.authorityMode === 'fallback'
  const qualityTier = classifySignalQualityTier(input.signalConfidence, fallbackUsed)
  const sourceClass = deriveSignalFrameSourceClass({
    sourceUsed: input.candidate.carbonSourceUsed,
    fallbackUsed,
    cacheStatus: input.candidate.cacheStatus,
  })
  const mirroredTruth = sourceClass === 'mirrored_truth'
  const referenceTime = input.candidate.waterAuthority.telemetryRef ?? new Date().toISOString()
  const fetchedAt = new Date().toISOString()

  return {
    signalFrameId: `signal:${input.decisionFrameId}`,
    decisionFrameId: input.decisionFrameId,
    selectedRegion: input.selectedRegion,
    selectedRunner: input.selectedRunner,
    sourceClass,
    cacheStatus: input.candidate.cacheStatus,
    qualityTier,
    mirrorState: {
      status: fallbackUsed ? 'fallback' : mirroredTruth ? 'mirrored' : 'live',
      mirroredTruth,
      revisionState:
        input.candidate.cacheStatus === 'degraded-safe'
          ? 'fallback_only'
          : fallbackUsed
            ? 'pending_reconciliation'
            : 'stable',
      reconciliationLagSec:
        input.candidate.cacheStatus === 'degraded-safe' ? input.candidate.carbonFreshnessSec : null,
    },
    carbon: {
      intensity: input.candidate.carbonIntensity,
      confidence: input.candidate.carbonConfidence,
      sourceUsed: input.candidate.carbonSourceUsed,
      contributingSources: [input.candidate.carbonSourceUsed],
      signalMode: input.candidate.signalMode,
      accountingMethod: input.candidate.accountingMethod,
      freshnessSec: input.candidate.carbonFreshnessSec,
      disagreementFlag: input.candidate.carbonDisagreementFlag,
      disagreementPct: input.candidate.carbonDisagreementPct,
      fallbackUsed: input.candidate.carbonFallbackUsed,
      referenceTime,
      fetchedAt,
    },
    water: {
      authorityMode: input.candidate.waterAuthority.authorityMode,
      scenario: input.candidate.waterAuthority.scenario,
      confidence: input.candidate.waterAuthority.confidence,
      stressIndex: input.candidate.waterSignal.waterStressIndex,
      impactLiters: input.candidate.waterImpactLiters,
      scarcityImpact: input.candidate.scarcityImpact,
      fallbackUsed:
        Boolean(input.candidate.waterSignal.fallbackUsed) ||
        input.candidate.waterAuthority.authorityMode === 'fallback',
      freshnessSec: input.candidate.waterFreshnessSec,
      supplierSet: input.candidate.waterAuthority.supplierSet,
      evidenceRefs: input.candidate.waterAuthority.evidenceRefs,
      facilityId: input.candidate.waterAuthority.facilityId ?? null,
    },
    latency: {
      bottleneckScore: input.bottleneckScore,
      providerResolutionMs: input.candidate.providerResolutionMs,
    },
    cost: {
      selectedCandidateScore: input.candidate.score,
    },
    confidence: {
      signalConfidence: input.signalConfidence,
      lowestDefensibleSignal:
        input.candidate.defensiblePenalty > 0 || input.candidate.defensibleReasonCodes.length > 0,
      defensiblePenalty: input.candidate.defensiblePenalty,
      defensibleReasonCodes: input.candidate.defensibleReasonCodes,
    },
    provenance: {
      providerSnapshotRef: input.candidate.providerSnapshotRef,
      policyReferenceCandidates: input.policyReferenceCandidates,
    },
  }
}

export function buildGovernanceFrame(input: {
  decisionFrameId: string
  source: string
  strict: boolean
  zone: 'green' | 'amber' | 'red'
  score: number
  weights: {
    carbon: number | null
    water: number | null
    latency: number | null
    cost: number | null
  }
  thresholds: Record<string, number | null>
  constraintsApplied: string[]
  triggers: {
    red: string[]
    amber: string[]
  }
  policyReference: string | null
  policyReferences: string[]
  fallbackUsed: boolean
  precedenceOverrideApplied: boolean
  lease: {
    lease_id: string
    lease_expires_at: string
    must_revalidate_after: string
    leaseMinutes: number
  } | null
}): GovernanceFrame {
  const allTriggers = Array.from(
    new Set([
      ...input.triggers.red,
      ...input.triggers.amber,
      ...input.constraintsApplied,
    ])
  )

  return {
    governanceFrameId: `governance:${input.decisionFrameId}`,
    decisionFrameId: input.decisionFrameId,
    frameworkLabel: 'SAIQ',
    source: input.source,
    strict: input.strict,
    zone: input.zone,
    score: input.score,
    weights: input.weights,
    thresholds: input.thresholds,
    triggers: {
      red: Array.from(new Set(input.triggers.red)),
      amber: Array.from(new Set(input.triggers.amber)),
      all: allTriggers,
    },
    constraintsApplied: input.constraintsApplied,
    policyReference: input.policyReference,
    policyReferences: input.policyReferences,
    fallbackUsed: input.fallbackUsed,
    precedenceOverrideApplied: input.precedenceOverrideApplied,
    lease: input.lease,
  }
}
