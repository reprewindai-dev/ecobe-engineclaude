import 'server-only'

import { fetchEngineJson, hasInternalApiKey } from './engine'
import type {
  CiHealthSnapshot,
  CiSloSnapshot,
  CommandCenterDecisionItem,
  CommandCenterSnapshot,
  ControlAction,
  ControlSurfaceProviderNode,
  DecisionTraceRawRecord,
  LiveSystemReplayResponse,
  WorldExecutionState,
  WorldRegionState,
  WorldRoutingFlow,
} from '@/types/control-surface'

type DecisionRow = {
  decisionFrameId: string
  createdAt: string
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
  waterEvidenceRefs?: string[]
  waterImpactLiters: number | null
  waterBaselineLiters: number | null
  waterScarcityImpact: number | null
  waterStressIndex: number | null
  waterConfidence: number | null
  fallbackUsed: boolean
  jobType: string
  metadata: Record<string, unknown>
  traceAvailable?: boolean
  governanceSource?: string | null
  traceHash?: string | null
  latencyMs?: {
    total: number
    compute: number
    providerResolution?: number
    cacheStatus?: 'live' | 'warm' | 'redis' | 'lkg' | 'degraded-safe' | 'fallback'
    providers?: {
      electricityMaps?: number | null
      wattTime?: number | null
      validation?: number | null
    }
    withinEnvelope?: boolean
  } | null
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
    authorityRole?: 'baseline' | 'overlay' | 'facility'
    authorityStatus?: 'authoritative' | 'advisory' | 'fallback'
    region?: string
    scenario?: 'current' | '2030' | '2050' | '2080'
    authorityMode?: 'basin' | 'facility_overlay' | 'fallback'
    confidence?: number | null
    observedAt?: string | null
    evidenceRefs?: string[]
    metadata?: Record<string, unknown> | null
    freshnessSec?: number | null
    datasetVersion?: string | null
  }>
}

type WaterProvenanceResponse = {
  datasets: Array<{
    name: string
    datasetVersion: string | null
    manifestHash: string | null
    computedHash: string | null
    verificationStatus: 'verified' | 'unverified' | 'missing_source' | 'mismatch' | 'unavailable'
  }>
}

const REGION_ANCHORS: Record<string, { label: string; x: number; y: number }> = {
  'us-west-2': { label: 'US West 2', x: 14, y: 25 },
  'us-west-1': { label: 'US West 1', x: 17, y: 28 },
  'us-east-2': { label: 'US East 2', x: 28, y: 23 },
  'us-east-1': { label: 'US East 1', x: 31, y: 26 },
  'eu-west-1': { label: 'EU West 1', x: 50, y: 22 },
  'eu-central-1': { label: 'EU Central 1', x: 56, y: 23 },
  'eu-north-1': { label: 'EU North 1', x: 57, y: 16 },
  'ap-southeast-1': { label: 'AP SouthEast 1', x: 79, y: 34 },
  'ap-northeast-1': { label: 'AP NorthEast 1', x: 83, y: 18 },
}

const STATIC_WATER_BUNDLE_TTL_SEC = 30 * 24 * 60 * 60
const LIVE_PROVIDER_TTL_SEC: Record<string, number> = {
  WATTTIME_MOER: 600,
  GRIDSTATUS: 1800,
  EIA_930: 1800,
  GB_CARBON: 1800,
  DK_CARBON: 1800,
  FI_CARBON: 1800,
  EMBER_STRUCTURAL_BASELINE: 86400,
}

function normalizeProviderIdentity(provider: string): string {
  const normalized = provider.trim().toUpperCase().replace(/[\s-]+/g, '_')
  if (normalized === 'EMBER' || normalized === 'EMBER_STRUCTURAL' || normalized === 'EMBER_STRUCTURAL_BASELINE') {
    return 'EMBER_STRUCTURAL_BASELINE'
  }
  if (normalized === 'WATTTIME') return 'WATTTIME_MOER'
  return normalized
}

function providerLabel(provider: string): string {
  return provider.replace(/_/g, ' ')
}

function humanizeStatusReason(code: NonNullable<ControlSurfaceProviderNode['statusReasonCode']>): string {
  return code.toLowerCase().replace(/_/g, ' ')
}

function resolveLiveProviderTtl(provider: string) {
  return LIVE_PROVIDER_TTL_SEC[provider] ?? 3600
}

function isCanonicalCarbonProvider(provider: string) {
  return (
    provider === 'WATTTIME_MOER' ||
    provider === 'GRIDSTATUS' ||
    provider === 'EIA_930' ||
    provider === 'GB_CARBON' ||
    provider === 'DK_CARBON' ||
    provider === 'FI_CARBON' ||
    provider === 'EMBER_STRUCTURAL_BASELINE'
  )
}

function choosePreferredCarbonRecord(
  current:
    | {
        key: string
        snapshots: ProviderTrustResponse['providers'][string]
      }
    | undefined,
  next: {
    key: string
    snapshots: ProviderTrustResponse['providers'][string]
  }
) {
  if (!current) return next
  if (normalizeProviderIdentity(next.key) === 'EMBER_STRUCTURAL_BASELINE') {
    const currentExact = normalizeProviderIdentity(current.key) === current.key
    const nextExact = normalizeProviderIdentity(next.key) === next.key
    if (nextExact && !currentExact) return next
  }
  return current
}

function asAction(value: string | undefined): string {
  return value ?? 'run_now'
}

function toWorldExecutionState(decision: DecisionRow): WorldExecutionState {
  const action = asAction(decision.action ?? decision.decisionAction)
  const reason = decision.reasonCode.toUpperCase()

  if (
    action === 'deny' ||
    reason.includes('DENY') ||
    reason.includes('HIGH_WATER') ||
    reason.includes('GUARDRAIL') ||
    reason.includes('NO_SAFE_REGION') ||
    reason.includes('CRISIS_MODE')
  ) {
    return 'blocked'
  }

  if (
    action === 'delay' ||
    decision.fallbackUsed ||
    decision.signalMode === 'fallback' ||
    decision.waterAuthorityMode === 'fallback'
  ) {
    return 'marginal'
  }

  return 'active'
}

function buildCommandCenterDecisionItem(decision: DecisionRow): CommandCenterDecisionItem {
  return {
    decisionFrameId: decision.decisionFrameId,
    createdAt: decision.createdAt,
    action: asAction(decision.action ?? decision.decisionAction),
    reasonCode: decision.reasonCode,
    selectedRegion: decision.selectedRegion,
    proofHash: decision.proofHash ?? null,
    traceAvailable: Boolean(decision.traceAvailable),
    governanceSource: decision.governanceSource ?? null,
    latencyTotalMs: decision.latencyMs?.total ?? null,
    latencyComputeMs: decision.latencyMs?.compute ?? null,
    signalMode: decision.signalMode ?? null,
    accountingMethod: decision.accountingMethod ?? null,
    waterAuthorityMode: decision.waterAuthorityMode ?? null,
    fallbackUsed: decision.fallbackUsed,
    systemState: toWorldExecutionState(decision),
  }
}

function buildProviders(
  providerTrust: ProviderTrustResponse,
  provenance: WaterProvenanceResponse
): ControlSurfaceProviderNode[] {
  const freshnessMap = new Map(
    providerTrust.freshness.map((item) => [normalizeProviderIdentity(item.provider), item])
  )
  const provenanceMap = new Map(
    provenance.datasets.map((dataset) => [dataset.name.trim().toLowerCase(), dataset])
  )
  const resolveLatencyMs = (metadata: Record<string, unknown> | null | undefined) => {
    if (!metadata) return null

    const candidates = [
      metadata.lastLatencyMs,
      metadata.latencyMs,
      metadata.providerLatencyMs,
    ]

    for (const value of candidates) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.round(value)
      }
    }

    return null
  }

  const carbonProviderBuckets = new Map<
    string,
    {
      key: string
      snapshots: ProviderTrustResponse['providers'][string]
    }
  >()

  for (const [key, snapshots] of Object.entries(providerTrust.providers)) {
    const canonicalKey = normalizeProviderIdentity(key)
    carbonProviderBuckets.set(
      canonicalKey,
      choosePreferredCarbonRecord(carbonProviderBuckets.get(canonicalKey), {
        key,
        snapshots,
      })
    )
  }

  for (const canonicalKey of Array.from(freshnessMap.keys())) {
    if (!isCanonicalCarbonProvider(canonicalKey) || carbonProviderBuckets.has(canonicalKey)) {
      continue
    }

    carbonProviderBuckets.set(canonicalKey, {
      key: canonicalKey,
      snapshots: [],
    })
  }

  const carbonProviders = Array.from(carbonProviderBuckets.entries()).map(([canonicalKey, record]) => {
    const fresh = freshnessMap.get(canonicalKey)
    const latestConfidence = record.snapshots[0]?.confidence ?? null
    const latestMetadata = record.snapshots[0]?.metadata ?? null
    const fallbackFreshnessSec = record.snapshots[0]?.freshnessSec ?? null
    const freshnessSec =
      fresh && fresh.freshnessSec >= 0
        ? fresh.freshnessSec
        : fallbackFreshnessSec
    const metadataText = latestMetadata ? JSON.stringify(latestMetadata).toLowerCase() : ''
    const rateLimited =
      metadataText.includes('429') || metadataText.includes('rate limit') || metadataText.includes('quota')
    const isStale =
      fresh && fresh.freshnessSec >= 0
        ? Boolean(fresh.isStale)
        : freshnessSec != null
          ? freshnessSec > resolveLiveProviderTtl(canonicalKey)
          : false
    const statusReasonCode: ControlSurfaceProviderNode['statusReasonCode'] = isStale
      ? rateLimited
        ? 'DEGRADED_RATE_LIMIT'
        : 'DEGRADED_STALE'
      : 'HEALTHY_LIVE'

    return {
      id: canonicalKey,
      label: providerLabel(canonicalKey),
      providerType: 'carbon' as const,
      status: isStale ? 'degraded' : 'healthy',
      statusReasonCode,
      statusLabel: humanizeStatusReason(statusReasonCode),
      freshnessSec,
      latencyMs: resolveLatencyMs(latestMetadata),
      confidence: latestConfidence,
      mirrored: canonicalKey === 'EMBER_STRUCTURAL_BASELINE',
      lineageCount: record.snapshots.length,
      mode: canonicalKey === 'EMBER_STRUCTURAL_BASELINE' ? 'mirrored' : isStale ? 'fallback' : 'live',
      signalAuthority: canonicalKey.includes('WATTTIME') ? 'marginal' : isStale ? 'fallback' : 'average',
      degradedReason: isStale
        ? rateLimited
          ? 'Provider is rate limited or quota constrained.'
          : 'Freshness breached the safe live-signal window.'
        : null,
      mirrorVersion: typeof latestMetadata?.version === 'string' ? latestMetadata.version : null,
    } satisfies ControlSurfaceProviderNode
  })

  const knownWaterProviderOrder = ['aqueduct', 'aware', 'wwf', 'nrel']
  const waterProviderBuckets = new Map<string, NonNullable<ProviderTrustResponse['waterProviders']>[number]>()

  for (const provider of providerTrust.waterProviders ?? []) {
    if (provider.provider.toLowerCase().startsWith('facility:')) {
      continue
    }

    if (provider.provider.trim().toLowerCase().startsWith('fallback')) {
      continue
    }

    const key = provider.provider.trim().toLowerCase()
    const current = waterProviderBuckets.get(key)
    if (!current) {
      waterProviderBuckets.set(key, provider)
      continue
    }

    const currentConfidence = current.confidence ?? -1
    const nextConfidence = provider.confidence ?? -1
    const currentObservedAt = current.observedAt ? new Date(current.observedAt).getTime() : 0
    const nextObservedAt = provider.observedAt ? new Date(provider.observedAt).getTime() : 0

    if (nextConfidence > currentConfidence || nextObservedAt > currentObservedAt) {
      waterProviderBuckets.set(key, provider)
    }
  }

  for (const dataset of provenance.datasets) {
    const key = dataset.name.trim().toLowerCase()
    if (waterProviderBuckets.has(key)) continue
    waterProviderBuckets.set(key, {
      provider: dataset.name.toLowerCase(),
      authorityRole: dataset.name.toLowerCase() === 'aqueduct' ? 'baseline' : 'overlay',
      authorityStatus: dataset.verificationStatus === 'verified' ? 'advisory' : 'fallback',
      scenario: 'current',
      authorityMode: 'basin',
      confidence: null,
      observedAt: null,
      evidenceRefs: [],
      metadata: {},
      freshnessSec: null,
      datasetVersion: dataset.datasetVersion,
    })
  }

  const waterProviders = Array.from(waterProviderBuckets.values()).map((provider) => {
    const freshnessSec =
      provider.freshnessSec ??
      (provider.observedAt ? Math.max(0, Math.round((Date.now() - new Date(provider.observedAt).getTime()) / 1000)) : null)
    const provenanceRecord = provenanceMap.get(provider.provider.trim().toLowerCase())
    const provenanceStatus = provenanceRecord?.verificationStatus ?? 'unavailable'
    const bundleExpired = freshnessSec != null && freshnessSec > STATIC_WATER_BUNDLE_TTL_SEC
    const authorityFallback = provider.authorityStatus === 'fallback'

    let status: ControlSurfaceProviderNode['status'] = 'healthy'
    let statusReasonCode: ControlSurfaceProviderNode['statusReasonCode'] = 'VERIFIED_STATIC'
    let degradedReason: string | null = null

    if (authorityFallback) {
      status = 'degraded'
      statusReasonCode = 'PROVENANCE_FAILED'
      degradedReason = 'Water authority degraded to fallback posture.'
    } else if (provenanceStatus === 'mismatch') {
      status = 'degraded'
      statusReasonCode = 'HASH_MISMATCH'
      degradedReason = 'Verified dataset hash does not match the current manifest.'
    } else if (provenanceStatus === 'missing_source' || provenanceStatus === 'unverified' || provenanceStatus === 'unavailable') {
      status = 'degraded'
      statusReasonCode = 'PROVENANCE_FAILED'
      degradedReason = 'Water provenance could not be verified from the current bundle.'
    } else if (bundleExpired) {
      status = 'degraded'
      statusReasonCode = 'EXPIRED_BUNDLE'
      degradedReason = 'Verified static bundle is past its allowed TTL.'
    }

    return {
      id: `water:${provider.provider}`,
      label: providerLabel(provider.provider),
      providerType: 'water' as const,
      status,
      statusReasonCode,
      statusLabel: humanizeStatusReason(statusReasonCode),
      freshnessSec,
      latencyMs: resolveLatencyMs(provider.metadata ?? null),
      confidence: provider.confidence ?? null,
      mirrored: false,
      lineageCount: provider.evidenceRefs?.length ?? 0,
      mode: authorityFallback ? 'fallback' : 'mirrored',
      signalAuthority: authorityFallback ? 'fallback' : 'average',
      authorityRole:
        provider.authorityStatus === 'authoritative'
          ? 'authoritative'
          : authorityFallback
            ? 'fallback'
            : 'advisory',
      authorityMode: provider.authorityMode ?? 'basin',
      scenario: provider.scenario ?? 'current',
      degradedReason,
      mirrorVersion: provider.datasetVersion ?? null,
      ttlSec: STATIC_WATER_BUNDLE_TTL_SEC,
      provenanceStatus,
    } satisfies ControlSurfaceProviderNode
  })

  const carbonOrder = ['WATTTIME_MOER', 'GRIDSTATUS', 'EIA_930', 'EMBER_STRUCTURAL_BASELINE']
  carbonProviders.sort((a, b) => {
    const aIndex = carbonOrder.indexOf(a.id)
    const bIndex = carbonOrder.indexOf(b.id)
    if (aIndex === -1 && bIndex === -1) return a.label.localeCompare(b.label)
    if (aIndex === -1) return 1
    if (bIndex === -1) return -1
    return aIndex - bIndex
  })

  waterProviders.sort((a, b) => {
    const aKey = a.id.replace(/^water:/, '').toLowerCase()
    const bKey = b.id.replace(/^water:/, '').toLowerCase()
    const aIndex = knownWaterProviderOrder.indexOf(aKey)
    const bIndex = knownWaterProviderOrder.indexOf(bKey)
    if (aIndex === -1 && bIndex === -1) return a.label.localeCompare(b.label)
    if (aIndex === -1) return 1
    if (bIndex === -1) return -1
    return aIndex - bIndex
  })

  return [...carbonProviders, ...waterProviders]
}

function resolveRegionAnchor(region: string, index: number) {
  const anchor = REGION_ANCHORS[region]
  if (anchor) return { region, ...anchor }

  const fallbackX = 14 + ((index % 6) * 14)
  const fallbackY = 48 + Math.floor(index / 6) * 7
  return {
    region,
    label: region,
    x: fallbackX,
    y: fallbackY,
  }
}

function buildWorldNodes(
  decisions: CommandCenterDecisionItem[],
  selectedTrace: DecisionTraceRawRecord | null,
  selectedReplay: LiveSystemReplayResponse | null
): WorldRegionState[] {
  const seen = new Map<string, CommandCenterDecisionItem>()
  decisions.forEach((decision) => {
    if (!seen.has(decision.selectedRegion)) {
      seen.set(decision.selectedRegion, decision)
    }
  })

  const baselineRegion = selectedReplay?.persisted?.baseline.region ?? selectedReplay?.replay?.baseline.region ?? null
  if (baselineRegion && !seen.has(baselineRegion)) {
    seen.set(baselineRegion, {
      decisionFrameId: selectedTrace?.decisionFrameId ?? `baseline:${baselineRegion}`,
      createdAt: selectedReplay?.replayedAt ?? new Date().toISOString(),
      action: selectedReplay?.replay.decision ?? 'run_now',
      reasonCode: selectedReplay?.replay.reasonCode ?? 'BASELINE_REGION',
      selectedRegion: baselineRegion,
      proofHash: selectedReplay?.persisted?.proofHash ?? selectedReplay?.replay.proofHash ?? null,
      traceAvailable: Boolean(selectedTrace),
      governanceSource: selectedTrace?.payload.governance.source ?? null,
      latencyTotalMs: selectedReplay?.persisted?.latencyMs?.total ?? selectedReplay?.replay.latencyMs?.total ?? null,
      latencyComputeMs:
        selectedReplay?.persisted?.latencyMs?.compute ?? selectedReplay?.replay.latencyMs?.compute ?? null,
      signalMode: selectedReplay?.persisted?.signalMode ?? selectedReplay?.replay.signalMode ?? null,
      accountingMethod:
        selectedReplay?.persisted?.accountingMethod ?? selectedReplay?.replay.accountingMethod ?? null,
      waterAuthorityMode:
        selectedReplay?.persisted?.waterAuthority.authorityMode ??
        selectedReplay?.replay.waterAuthority.authorityMode ??
        null,
      fallbackUsed: Boolean(selectedReplay?.persisted?.fallbackUsed ?? selectedReplay?.replay.fallbackUsed),
      systemState: 'marginal',
    })
  }

  return Array.from(seen.values()).map((decision, index) => {
    const anchor = resolveRegionAnchor(decision.selectedRegion, index)
    return {
      region: decision.selectedRegion,
      label: anchor.label,
      x: anchor.x,
      y: anchor.y,
      state: decision.systemState,
      decisionFrameId: decision.decisionFrameId,
      action: decision.action,
      reasonCode: decision.reasonCode,
    }
  })
}

function buildWorldFlows(selectedReplay: LiveSystemReplayResponse | null): WorldRoutingFlow[] {
  if (!selectedReplay) return []

  const action = selectedReplay.persisted?.decision ?? selectedReplay.replay.decision
  const baselineRegion = selectedReplay.persisted?.baseline.region ?? selectedReplay.replay.baseline.region
  const selectedRegion = selectedReplay.persisted?.selectedRegion ?? selectedReplay.replay.selectedRegion
  if (!baselineRegion || !selectedRegion) return []

  return [
    {
      id: `${selectedReplay.decisionFrameId}:${baselineRegion}:${selectedRegion}`,
      fromRegion: baselineRegion,
      toRegion: selectedRegion,
      mode: action === 'run_now' || action === 'reroute' ? 'route' : 'blocked',
    },
  ]
}

function extractThresholds(
  trace: DecisionTraceRawRecord | null,
  replay: LiveSystemReplayResponse | null
): Record<string, number | null> | null {
  const traceThresholds = trace?.payload.governance.thresholds
  if (traceThresholds && typeof traceThresholds === 'object' && !Array.isArray(traceThresholds)) {
    const traceEntries = Object.entries(traceThresholds)
      .filter(([, value]) => typeof value === 'number')
      .map(([key, value]) => [key, value as number | null] as const)
    if (traceEntries.length) {
      return Object.fromEntries(traceEntries)
    }
  }

  const source = replay?.persisted?.policyTrace ?? replay?.replay.policyTrace
  const candidate = source?.thresholds
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null

  const entries = Object.entries(candidate as Record<string, unknown>)
    .filter(([, value]) => typeof value === 'number')
    .map(([key, value]) => [key, value as number | null])

  return entries.length ? Object.fromEntries(entries) : null
}

function extractWeights(
  trace: DecisionTraceRawRecord | null
): { carbon: number | null; water: number | null; latency: number | null; cost: number | null } | null {
  const weights = trace?.payload.governance.weights
  if (!weights) return null

  const carbon = typeof weights.carbon === 'number' ? weights.carbon : null
  const water = typeof weights.water === 'number' ? weights.water : null
  const latency = typeof weights.latency === 'number' ? weights.latency : null
  const cost = typeof weights.cost === 'number' ? weights.cost : null

  return carbon != null || water != null || latency != null || cost != null
    ? { carbon, water, latency, cost }
    : null
}

export async function getCommandCenterSnapshot(): Promise<CommandCenterSnapshot> {
  const [health, slo, decisionFeed, providerTrust, provenance] = await Promise.all([
    fetchEngineJson<CiHealthSnapshot>('/ci/health'),
    fetchEngineJson<CiSloSnapshot>('/ci/slo'),
    fetchEngineJson<DecisionFeed>('/ci/decisions?limit=8'),
    fetchEngineJson<ProviderTrustResponse>('/dashboard/provider-trust').catch(() => ({
      freshness: [],
      providers: {},
      waterProviders: [],
    })),
    fetchEngineJson<WaterProvenanceResponse>('/water/provenance'),
  ])

  const recentDecisions = decisionFeed.decisions.map(buildCommandCenterDecisionItem)
  const defaultSelected =
    recentDecisions.find((decision) => decision.traceAvailable) ?? recentDecisions[0] ?? null

  const [selectedTrace, selectedReplay] =
    defaultSelected && hasInternalApiKey()
      ? await Promise.all([
          fetchEngineJson<DecisionTraceRawRecord>(
            `/ci/decisions/${encodeURIComponent(defaultSelected.decisionFrameId)}/trace/raw`,
            undefined,
            { internal: true }
          ).catch(() => null),
          fetchEngineJson<LiveSystemReplayResponse>(
            `/ci/decisions/${encodeURIComponent(defaultSelected.decisionFrameId)}/replay`,
            undefined,
            { internal: true }
          ).catch(() => null),
        ])
      : [null, null]

  const providers = buildProviders(providerTrust, provenance)
  const worldNodes = buildWorldNodes(recentDecisions, selectedTrace, selectedReplay)
  const worldFlows = buildWorldFlows(selectedReplay)
  const selectedScore =
    selectedTrace?.payload.normalizedSignals.candidates.find(
      (candidate) => candidate.region === selectedTrace.payload.decisionPath.selectedRegion
    )?.score ?? null

  return {
    generatedAt: new Date().toISOString(),
    selectedDecisionFrameId: defaultSelected?.decisionFrameId ?? null,
    header: {
      systemActive: health.status === 'healthy',
      systemStatus: health.status,
      saiqEnforced: selectedTrace ? selectedTrace.payload.governance.source !== 'NONE' : null,
      traceLocked: selectedTrace ? Boolean(selectedTrace.traceHash) : null,
      replayVerified: selectedReplay?.deterministicMatch ?? null,
      detail: `p95 ${slo.p95.totalMs.toFixed(0)}ms | ${providers.length} providers | ${
        provenance.datasets.filter((dataset) => dataset.verificationStatus === 'verified').length
      } verified water datasets`,
    },
    world: {
      nodes: worldNodes,
      flows: worldFlows,
    },
    decisionCore: {
      recentDecisions,
      selectedDecision: defaultSelected,
      selectedTrace,
      selectedReplay,
    },
    governance: {
      frameworkLabel: 'SAIQ',
      source: selectedTrace?.payload.governance.source ?? null,
      active: selectedTrace ? selectedTrace.payload.governance.source !== 'NONE' : null,
      strict: selectedTrace?.payload.governance.strict ?? null,
      enforcementMode: selectedTrace?.payload.decisionPath.operatingMode ?? null,
      selectedScore: selectedTrace?.payload.governance.score ?? selectedScore,
      thresholds: extractThresholds(selectedTrace, selectedReplay),
      weights: extractWeights(selectedTrace),
      impact: {
        carbonReductionPct:
          selectedReplay?.persisted?.savings.carbonReductionPct ??
          selectedReplay?.replay.savings.carbonReductionPct ??
          null,
        waterImpactDeltaLiters:
          selectedReplay?.persisted?.savings.waterImpactDeltaLiters ??
          selectedReplay?.replay.savings.waterImpactDeltaLiters ??
          null,
        signalConfidence:
          selectedReplay?.persisted?.signalConfidence ?? selectedReplay?.replay.signalConfidence ?? null,
        constraintsApplied: selectedTrace?.payload.governance.constraintsApplied.length ?? 0,
        cacheHit: selectedTrace?.payload.performance.cacheHit ?? null,
      },
    },
    traceStream: {
      items: recentDecisions.map((decision) => ({
        decisionFrameId: decision.decisionFrameId,
        createdAt: decision.createdAt,
        action: decision.action,
        region: decision.selectedRegion,
        reasonCode: decision.reasonCode,
        proofAvailable: Boolean(decision.proofHash),
        traceAvailable: decision.traceAvailable,
        governanceSource: decision.governanceSource,
        replayVerified:
          decision.decisionFrameId === defaultSelected?.decisionFrameId
            ? selectedReplay?.deterministicMatch ?? null
            : null,
      })),
    },
    health: {
      service: {
        status: health.status,
        proofPosture: selectedReplay?.deterministicMatch ? 'Replay verified' : 'Trace-backed proof live',
        detail: `DB ${health.checks.database ? 'ok' : 'degraded'} | Water artifacts ${
          health.checks.waterArtifacts.schemaCompatible ? 'verified' : 'degraded'
        } | Rolling p95 ${slo.p95.totalMs.toFixed(0)}ms`,
      },
      latency: {
        available: true,
        error: null,
        samples: slo.samples,
        p95TotalMs: slo.p95.totalMs,
        p95ComputeMs: slo.p95.computeMs,
        budgetTotalP95Ms: slo.budget.totalP95Ms,
        budgetComputeP95Ms: slo.budget.computeP95Ms,
        withinBudget: {
          total: slo.withinBudget.total,
          compute: slo.withinBudget.compute,
        },
      },
      provenance: {
        available: true,
        error: null,
        datasets: provenance.datasets
          .filter((dataset) => ['aqueduct', 'aware', 'wwf', 'nrel'].includes(dataset.name.toLowerCase()))
          .map((dataset) => ({
            name: dataset.name.toLowerCase() as 'aqueduct' | 'aware' | 'wwf' | 'nrel',
            verificationStatus: dataset.verificationStatus,
            datasetVersion: dataset.datasetVersion,
            manifestHash: dataset.manifestHash,
            computedHash: dataset.computedHash,
          })),
      },
      providers,
    },
  }
}
