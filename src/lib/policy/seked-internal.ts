import type {
  SekedPolicyAdapterRequest,
  SekedPolicyAdapterResult,
  SekedDirective,
  SekedGovernanceThresholds,
  SekedGovernanceWeights,
} from './seked-policy-adapter'

const SEKED_INTERNAL_POLICY_REFERENCE = 'seked.internal.v1'

const GOVERNANCE_THRESHOLDS: SekedGovernanceThresholds = {
  amberMin: 0.45,
  redMin: 0.7,
  minSignalConfidence: 0.6,
  waterStressDelay: 4.0,
  waterStressDeny: 4.7,
}

const DEFAULT_GOVERNANCE_THRESHOLDS = {
  amberMin: GOVERNANCE_THRESHOLDS.amberMin ?? 0.45,
  redMin: GOVERNANCE_THRESHOLDS.redMin ?? 0.7,
  minSignalConfidence: GOVERNANCE_THRESHOLDS.minSignalConfidence ?? 0.6,
  waterStressDelay: GOVERNANCE_THRESHOLDS.waterStressDelay ?? 4.0,
  waterStressDeny: GOVERNANCE_THRESHOLDS.waterStressDeny ?? 4.7,
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function getWeights(request: SekedPolicyAdapterRequest): SekedGovernanceWeights | null {
  const weights = {
    carbon: request.weights?.carbon ?? null,
    water: request.weights?.water ?? null,
    latency: request.weights?.latency ?? null,
    cost: request.weights?.cost ?? null,
  }

  return Object.values(weights).some((value) => typeof value === 'number') ? weights : null
}

function normalizeWeights(weights: SekedGovernanceWeights | null) {
  const carbon = weights?.carbon ?? 0
  const water = weights?.water ?? 0
  const latency = weights?.latency ?? 0
  const cost = weights?.cost ?? 0
  const total = carbon + water + latency + cost

  if (total <= 0) {
    return {
      carbon: 0.25,
      water: 0.25,
      latency: 0.25,
      cost: 0.25,
    }
  }

  return {
    carbon: carbon / total,
    water: water / total,
    latency: latency / total,
    cost: cost / total,
  }
}

function pickSelectedCandidate(request: SekedPolicyAdapterRequest) {
  return (
    request.candidates.find(
      (candidate) => candidate.region === request.provisionalDecision.selectedRegion
    ) ?? request.candidates[0]
  )
}

function pickBestAlternative(request: SekedPolicyAdapterRequest, selectedRegion: string) {
  return request.candidates
    .filter(
      (candidate) => candidate.region !== selectedRegion && !candidate.guardrailCandidateBlocked
    )
    .sort((a, b) => a.score - b.score)[0]
}

function computeGovernanceScore(
  request: SekedPolicyAdapterRequest,
  selected = pickSelectedCandidate(request)
) {
  const normalizedWeights = normalizeWeights(getWeights(request))
  const carbonRisk = clamp(selected.carbonIntensity / 600)
  const waterRisk = clamp(
    Math.max(
      selected.waterStressIndex / DEFAULT_GOVERNANCE_THRESHOLDS.waterStressDeny,
      selected.waterScarcityImpact / 10
    )
  )
  const latencyRisk = clamp(
    request.bottleneckScore != null ? request.bottleneckScore / 100 : request.criticality === 'critical' ? 0.7 : 0.25
  )
  const costRisk = clamp(selected.score / 100)
  const governanceScore =
    normalizedWeights.carbon * carbonRisk +
    normalizedWeights.water * waterRisk +
    normalizedWeights.latency * latencyRisk +
    normalizedWeights.cost * costRisk

  return {
    selected,
    normalizedWeights,
    governanceScore: Number(governanceScore.toFixed(6)),
  }
}

function deriveZone(input: {
  request: SekedPolicyAdapterRequest
  selected: SekedPolicyAdapterRequest['candidates'][number]
  governanceScore: number
}) {
  const { request, selected, governanceScore } = input

  if (
    selected.guardrailCandidateBlocked ||
    request.waterAuthority.authorityMode === 'fallback' ||
    request.waterAuthority.confidence < DEFAULT_GOVERNANCE_THRESHOLDS.minSignalConfidence ||
    selected.waterStressIndex >= DEFAULT_GOVERNANCE_THRESHOLDS.waterStressDeny ||
    governanceScore >= DEFAULT_GOVERNANCE_THRESHOLDS.redMin
  ) {
    return 'red' as const
  }

  if (
    selected.waterStressIndex >= DEFAULT_GOVERNANCE_THRESHOLDS.waterStressDelay ||
    selected.waterScarcityImpact >= 6 ||
    request.provisionalDecision.action === 'delay' ||
    governanceScore >= DEFAULT_GOVERNANCE_THRESHOLDS.amberMin
  ) {
    return 'amber' as const
  }

  return 'green' as const
}

function buildRationale(input: {
  zone: 'green' | 'amber' | 'red'
  request: SekedPolicyAdapterRequest
  selected: SekedPolicyAdapterRequest['candidates'][number]
}) {
  const reasons = [
    `zone=${input.zone}`,
    `selectedRegion=${input.selected.region}`,
    `waterStress=${input.selected.waterStressIndex.toFixed(3)}`,
    `scarcity=${input.selected.waterScarcityImpact.toFixed(3)}`,
    `authorityMode=${input.request.waterAuthority.authorityMode}`,
  ]

  if (input.selected.guardrailCandidateBlocked) {
    reasons.push('guardrailCandidateBlocked=true')
  }

  return reasons.join('; ')
}

function buildDirective(input: {
  request: SekedPolicyAdapterRequest
  selected: SekedPolicyAdapterRequest['candidates'][number]
  zone: 'green' | 'amber' | 'red'
  governanceScore: number
  normalizedWeights: ReturnType<typeof normalizeWeights>
}): SekedDirective {
  const { request, selected, zone, governanceScore, normalizedWeights } = input
  const bestAlternative = pickBestAlternative(request, selected.region)

  const directive: SekedDirective = {
    allow: zone === 'green',
    policyReference: SEKED_INTERNAL_POLICY_REFERENCE,
    rationale: buildRationale({ zone, request, selected }),
    governance: {
      source: 'SEKED_INTERNAL_V1',
      score: governanceScore,
      zone,
      weights: {
        carbon: Number(normalizedWeights.carbon.toFixed(6)),
        water: Number(normalizedWeights.water.toFixed(6)),
        latency: Number(normalizedWeights.latency.toFixed(6)),
        cost: Number(normalizedWeights.cost.toFixed(6)),
      },
      thresholds: DEFAULT_GOVERNANCE_THRESHOLDS,
    },
  }

  if (zone === 'red') {
    directive.allow = false
    directive.action =
      request.criticality === 'critical'
        ? 'throttle'
        : request.allowDelay
          ? 'delay'
          : 'deny'
    directive.reasonCode = 'SEKED_POLICY_RED_ZONE'
    return directive
  }

  if (zone === 'amber') {
    directive.allow = false
    if (bestAlternative) {
      directive.forceRegion = bestAlternative.region
      directive.action = 'reroute'
      directive.reasonCode = 'SEKED_POLICY_AMBER_REROUTE'
    } else {
      directive.action = request.allowDelay ? 'delay' : 'deny'
      directive.reasonCode = request.allowDelay
        ? 'SEKED_POLICY_AMBER_DELAY'
        : 'SEKED_POLICY_AMBER_DENY'
    }
    return directive
  }

  directive.reasonCode = 'SEKED_POLICY_GREEN_ALLOW'
  return directive
}

export function evaluateInternalSekedPolicy(
  request: SekedPolicyAdapterRequest
): SekedPolicyAdapterResult {
  const { selected, governanceScore, normalizedWeights } = computeGovernanceScore(request)
  const zone = deriveZone({ request, selected, governanceScore })
  const response = buildDirective({
    request,
    selected,
    zone,
    governanceScore,
    normalizedWeights,
  })

  return {
    enabled: true,
    strict: Boolean(request.strict),
    evaluated: true,
    applied: true,
    hookStatus: 'success',
    reasonCodes: [
      'SEKED_POLICY_ADAPTER_APPLIED',
      `SEKED_POLICY_ZONE_${zone.toUpperCase()}`,
    ],
    policyReference: response.policyReference ?? SEKED_INTERNAL_POLICY_REFERENCE,
    fallbackUsed: false,
    hardFailure: false,
    enforcedFailureAction: null,
    response,
  }
}
