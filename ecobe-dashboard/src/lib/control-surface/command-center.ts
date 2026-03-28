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
    cacheStatus?: 'live' | 'warm' | 'redis' | 'fallback'
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

function buildProviders(providerTrust: ProviderTrustResponse): ControlSurfaceProviderNode[] {
  const freshnessMap = new Map(providerTrust.freshness.map((item) => [item.provider.toUpperCase(), item]))

  const carbonProviders = Object.entries(providerTrust.providers).map(([key, snapshots]) => {
    const fresh = freshnessMap.get(key.toUpperCase()) ?? freshnessMap.get(key.toLowerCase())
    const latestConfidence = snapshots[0]?.confidence ?? null
    const latestMetadata = snapshots[0]?.metadata ?? null
    const isStale = Boolean(fresh?.isStale)

    return {
      id: key,
      label: key.replace(/_/g, ' '),
      providerType: 'carbon' as const,
      status: isStale ? 'degraded' : 'healthy',
      freshnessSec: fresh?.freshnessSec ?? snapshots[0]?.freshnessSec ?? null,
      confidence: latestConfidence,
      mirrored: key === 'ember',
      lineageCount: snapshots.length,
      mode: key === 'ember' ? 'mirrored' : isStale ? 'fallback' : 'live',
      signalAuthority: key.toLowerCase().includes('watttime') ? 'marginal' : isStale ? 'fallback' : 'average',
      degradedReason: isStale ? 'Freshness breached safe mirror window.' : null,
      mirrorVersion: typeof latestMetadata?.version === 'string' ? latestMetadata.version : null,
    } satisfies ControlSurfaceProviderNode
  })

  const waterProviders = (providerTrust.waterProviders ?? []).map((provider) => {
    const freshnessSec =
      provider.freshnessSec ??
      (provider.observedAt ? Math.max(0, Math.round((Date.now() - new Date(provider.observedAt).getTime()) / 1000)) : null)

    return {
      id: `water:${provider.provider}`,
      label: provider.provider.replace(/_/g, ' '),
      providerType: 'water' as const,
      status:
        provider.authorityStatus === 'fallback'
          ? 'degraded'
          : freshnessSec != null && freshnessSec > 172800
            ? 'degraded'
            : 'healthy',
      freshnessSec,
      confidence: provider.confidence ?? null,
      mirrored: false,
      lineageCount: provider.evidenceRefs?.length ?? 0,
      mode: provider.authorityStatus === 'fallback' ? 'fallback' : 'mirrored',
      signalAuthority: provider.authorityStatus === 'fallback' ? 'fallback' : 'average',
      authorityRole:
        provider.authorityStatus === 'authoritative'
          ? 'authoritative'
          : provider.authorityStatus === 'fallback'
            ? 'fallback'
            : 'advisory',
      authorityMode: provider.authorityMode ?? 'basin',
      scenario: provider.scenario ?? 'current',
      degradedReason: provider.authorityStatus === 'fallback' ? 'Water authority degraded to fallback posture.' : null,
      mirrorVersion: provider.datasetVersion ?? null,
    } satisfies ControlSurfaceProviderNode
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
  replay: LiveSystemReplayResponse | null
): Record<string, number | null> | null {
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
  const request = trace?.payload.inputSignals.request
  if (!request) return null

  const carbon = typeof request.carbonWeight === 'number' ? request.carbonWeight : null
  const water = typeof request.waterWeight === 'number' ? request.waterWeight : null
  const latency = typeof request.latencyWeight === 'number' ? request.latencyWeight : null
  const cost = typeof request.costWeight === 'number' ? request.costWeight : null

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

  const providers = buildProviders(providerTrust)
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
      selectedScore,
      thresholds: extractThresholds(selectedReplay),
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
