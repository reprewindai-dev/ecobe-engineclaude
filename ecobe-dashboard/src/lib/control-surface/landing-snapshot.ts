import 'server-only'

import { fetchEngineJson } from '@/lib/control-surface/engine'
import { getLiveSystemSnapshot } from '@/lib/control-surface/live-system'
import type {
  ActionDistributionItem,
  ControlAction,
  ControlSurfaceDecisionSummary,
  ControlSurfaceProviderNode,
  LandingSnapshot,
  LiveSystemSnapshot,
} from '@/types/control-surface'

type DecisionRow = {
  decisionFrameId: string
  selectedRunner: string
  selectedRegion: string
  carbonIntensity: number
  baseline: number
  savings: number
  decisionAction?: ControlAction
  action?: ControlAction
  reasonCode: string
  signalConfidence: number
  decisionMode?: 'runtime_authorization' | 'scenario_planning'
  signalMode?: 'marginal' | 'average' | 'fallback'
  accountingMethod?: 'marginal' | 'flow-traced' | 'average'
  notBefore?: string | null
  proofHash?: string
  waterAuthorityMode?: 'basin' | 'facility_overlay' | 'fallback'
  waterScenario?: 'current' | '2030' | '2050' | '2080'
  facilityId?: string | null
  waterImpactLiters: number | null
  waterBaselineLiters: number | null
  waterScarcityImpact: number | null
  waterStressIndex: number | null
  fallbackUsed: boolean
  jobType: string
  latencyMs?: {
    total: number
    compute: number
    cacheStatus?: 'live' | 'warm' | 'redis' | 'lkg' | 'degraded-safe' | 'fallback'
  } | null
  createdAt: string
}

type DecisionFeed = {
  decisions: DecisionRow[]
}

type ProviderTrustResponse = {
  freshness: Array<{
    provider: string
    latestObservedAt: string
    freshnessSec: number
    isStale: boolean
  }>
  providers: Record<
    string,
    Array<{
      zone: string
      signalType: string
      value: number
      confidence: number
      freshnessSec: number
      observedAt: string
      metadata?: Record<string, unknown> | null
    }>
  >
  waterProviders?: Array<{
    provider: string
    authorityStatus?: 'authoritative' | 'advisory' | 'fallback'
    authorityMode?: 'basin' | 'facility_overlay' | 'fallback'
    scenario?: 'current' | '2030' | '2050' | '2080'
    confidence?: number | null
    freshnessSec?: number | null
  }>
}

function toSourceMode(decision: DecisionRow): 'live' | 'mirrored' | 'fallback' {
  return decision.fallbackUsed ? 'fallback' : 'mirrored'
}

function buildDecisionSummary(decision: DecisionRow, index: number): ControlSurfaceDecisionSummary {
  const waterSelected = decision.waterImpactLiters ?? 0
  const waterBaseline = decision.waterBaselineLiters ?? waterSelected
  const waterDelta = Number((waterBaseline - waterSelected).toFixed(3))
  const action = decision.action ?? decision.decisionAction ?? 'run_now'
  const workloadLabel =
    decision.jobType === 'heavy'
      ? 'GPU build pipeline'
      : decision.jobType === 'light'
        ? 'Light CI verification'
        : 'CI execution frame'

  return {
    decisionFrameId: `LIVE-${String(index + 1).padStart(3, '0')}`,
    createdAt: decision.createdAt,
    workloadLabel,
    action,
    decisionMode: decision.decisionMode ?? 'runtime_authorization',
    reasonCode: decision.reasonCode,
    selectedRegion: decision.selectedRegion,
    selectedRunner: decision.selectedRunner,
    carbonIntensity: decision.carbonIntensity,
    baselineCarbonIntensity: decision.baseline,
    carbonReductionPct: decision.savings,
    waterSelectedLiters: waterSelected,
    waterBaselineLiters: waterBaseline,
    waterImpactDeltaLiters: waterDelta,
    waterScarcityImpact: decision.waterScarcityImpact ?? 0,
    waterStressIndex: decision.waterStressIndex ?? 0,
    signalConfidence: decision.signalConfidence,
    fallbackUsed: decision.fallbackUsed,
    sourceMode: toSourceMode(decision),
    signalMode: decision.signalMode ?? 'fallback',
    accountingMethod: decision.accountingMethod ?? 'average',
    waterAuthorityMode: decision.waterAuthorityMode ?? 'fallback',
    waterScenario: decision.waterScenario ?? 'current',
    facilityId: null,
    precedenceOverrideApplied: false,
    notBefore: decision.notBefore ?? null,
    proofHash: `public-live-${String(index + 1).padStart(3, '0')}`,
    latencyMs: decision.latencyMs ?? null,
    summaryReason:
      action === 'delay'
        ? 'Held for a safer carbon-water window'
        : action === 'reroute'
          ? 'Shifted to a cleaner execution region'
          : action === 'throttle'
            ? 'Rate limited under strict policy pressure'
            : action === 'deny'
              ? 'Blocked by deterministic doctrine'
              : 'Allowed to execute under current conditions',
  }
}

function buildActionDistribution(decisions: ControlSurfaceDecisionSummary[]): ActionDistributionItem[] {
  const counts: Record<ControlAction, number> = {
    run_now: 0,
    reroute: 0,
    delay: 0,
    throttle: 0,
    deny: 0,
  }
  decisions.forEach((decision) => {
    counts[decision.action] += 1
  })
  const total = decisions.length || 1
  return (Object.entries(counts) as Array<[ControlAction, number]>).map(([action, count]) => ({
    action,
    count,
    pct: Number(((count / total) * 100).toFixed(1)),
  }))
}

function buildProviders(providerTrust: ProviderTrustResponse): ControlSurfaceProviderNode[] {
  const freshnessMap = new Map(
    providerTrust.freshness.map((item) => [item.provider.toUpperCase(), item])
  )

  const carbonProviders: ControlSurfaceProviderNode[] = Object.entries(providerTrust.providers).map(([key, snapshots], index) => {
    const fresh = freshnessMap.get(key) ?? freshnessMap.get(key.toUpperCase())
    const isStale = Boolean(fresh?.isStale)
    const status: ControlSurfaceProviderNode['status'] = isStale ? 'degraded' : 'healthy'
    const mode: ControlSurfaceProviderNode['mode'] = isStale ? 'fallback' : 'mirrored'
    const signalAuthority: ControlSurfaceProviderNode['signalAuthority'] =
      key.toLowerCase().includes('watttime') ? 'marginal' : 'average'
    return {
      id: `provider-${index + 1}`,
      label: key.replace(/_/g, ' '),
      providerType: 'carbon' as const,
      status,
      freshnessSec: fresh?.freshnessSec ?? null,
      confidence: snapshots[0]?.confidence ?? null,
      mirrored: true,
      lineageCount: snapshots.length,
      mode,
      signalAuthority,
      degradedReason: isStale ? 'Freshness breached safe mirror window.' : null,
      mirrorVersion: null,
    }
  })

  const waterProviders: ControlSurfaceProviderNode[] = (providerTrust.waterProviders ?? []).map((provider, index) => {
    const status: ControlSurfaceProviderNode['status'] =
      provider.authorityStatus === 'fallback'
        ? 'degraded'
        : provider.freshnessSec != null && provider.freshnessSec > 172800
          ? 'degraded'
          : 'healthy'
    const mode: ControlSurfaceProviderNode['mode'] =
      provider.authorityStatus === 'fallback' ? 'fallback' : 'mirrored'
    const signalAuthority: ControlSurfaceProviderNode['signalAuthority'] =
      provider.authorityStatus === 'fallback' ? 'fallback' : 'average'

    return {
      id: `water-provider-${index + 1}`,
      label: provider.provider.replace(/_/g, ' '),
      providerType: 'water' as const,
      status,
      freshnessSec: provider.freshnessSec ?? null,
      confidence: provider.confidence ?? null,
      mirrored: false,
      lineageCount: 1,
      mode,
      signalAuthority,
      authorityRole:
        provider.authorityStatus === 'authoritative'
          ? 'authoritative'
          : provider.authorityStatus === 'fallback'
            ? 'fallback'
            : 'advisory',
      authorityMode: provider.authorityMode ?? 'basin',
      scenario: provider.scenario ?? 'current',
      degradedReason:
        provider.authorityStatus === 'fallback'
          ? 'Water authority is operating on fallback posture.'
          : null,
      mirrorVersion: null,
    }
  })

  return [...carbonProviders, ...waterProviders]
}

function redactLiveSystem(snapshot: LiveSystemSnapshot): LiveSystemSnapshot {
  return {
    ...snapshot,
    recentDecisions: {
      ...snapshot.recentDecisions,
      items: snapshot.recentDecisions.items.map((item, index) => ({
        ...item,
        decisionFrameId: `LIVE-${String(index + 1).padStart(3, '0')}`,
        proofHash: null,
        governanceSource: item.governanceSource ? 'SAIQ' : null,
      })),
    },
    traceLedger: {
      ...snapshot.traceLedger,
      traceHash: null,
      inputSignalHash: null,
      sequenceNumber: null,
    },
    governance: {
      ...snapshot.governance,
      policyState: snapshot.governance.active ? 'policy-first active' : snapshot.governance.policyState,
    },
    providers: {
      ...snapshot.providers,
      datasets: snapshot.providers.datasets.map((dataset) => ({
        ...dataset,
        manifestHash: null,
        computedHash: null,
      })),
    },
  }
}

function formatLastUpdated(timestamp: string) {
  const value = new Date(timestamp)
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(value)
}

export async function getLandingSnapshot(): Promise<LandingSnapshot> {
  const [decisionFeed, providerTrustResult, liveSystem] = await Promise.all([
    fetchEngineJson<DecisionFeed>('/ci/decisions?limit=12'),
    fetchEngineJson<ProviderTrustResponse>('/dashboard/provider-trust').catch(() => ({
      freshness: [],
      providers: {},
      waterProviders: [],
    })),
    getLiveSystemSnapshot(),
  ])

  const decisions = decisionFeed.decisions.map(buildDecisionSummary)
  const providers = buildProviders(providerTrustResult)
  const liveStrip = [...decisions]
    .sort(
      (a, b) =>
        b.carbonReductionPct + b.waterImpactDeltaLiters - (a.carbonReductionPct + a.waterImpactDeltaLiters)
    )
    .slice(0, 3)
    .map((decision) => ({
      decisionFrameId: decision.decisionFrameId,
      workloadLabel: decision.workloadLabel,
      action: decision.action,
      selectedRegion: decision.selectedRegion,
      carbonReductionPct: decision.carbonReductionPct,
    }))

  const featuredDecision = decisions[0] ?? null
  const waterProviders = providers.filter((provider) => provider.providerType === 'water')
  const verifiedWaterDatasets = waterProviders.filter(
    (provider) => provider.authorityRole === 'authoritative'
  ).length

  return {
    generatedAt: new Date().toISOString(),
    liveStatus: {
      visible: true,
      generatedAt: liveSystem.generatedAt,
      lastUpdatedLabel: formatLastUpdated(liveSystem.generatedAt),
      detail: 'Landing data is served from a public live mirror, not the operator console.',
    },
    overview: {
      actionDistribution: buildActionDistribution(decisions),
      providers,
      featuredDecision,
      liveStrip,
      proofContext: {
        proofRef: featuredDecision ? 'public proof sample' : null,
        governance: 'SAIQ policy-first governance',
        traceRef: featuredDecision ? 'public live mirror' : null,
        replay: 'public live mirror',
        provenance:
          waterProviders.length > 0
            ? `${verifiedWaterDatasets}/${waterProviders.length} water authorities verified`
            : 'verified water posture attaches with the public mirror',
      },
    },
    liveSystem: redactLiveSystem(liveSystem),
  }
}
