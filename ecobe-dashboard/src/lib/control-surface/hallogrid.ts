import 'server-only'

import { getCommandCenterSnapshot } from './command-center'
import { fetchEngineJson, hasInternalApiKey } from './engine'
import { formatFreshness, humanizeReasonCode } from './labels'
import type {
  CiRouteResponse,
  CommandCenterDecisionItem,
  DecisionExplanationContract,
  DecisionTrustContract,
  DecisionTraceRawRecord,
  HallOGridAdapterProfile,
  HallOGridFrame,
  HallOGridFrameDetail,
  HallOGridSnapshot,
  LiveSystemReplayResponse,
  ReplayBundle,
  WorkloadClass,
} from '@/types/control-surface'

const HALLOGRID_ADAPTERS: HallOGridAdapterProfile[] = [
  {
    id: 'canonical-rest',
    label: 'Canonical CO2 Router mirror',
    kind: 'canonical',
    enabled: true,
    notes: 'Dashboard-owned snapshot contract backed by the canonical command-center snapshot.',
  },
  {
    id: 'hallogrid-sse',
    label: 'HallOGrid SSE stream',
    kind: 'sse',
    enabled: true,
    notes: 'Live frame refresh over dashboard-owned server-sent events.',
  },
  {
    id: 'generic-websocket',
    label: 'Generic WebSocket adapter',
    kind: 'websocket',
    enabled: false,
    notes: 'Reserved for customer transports that emit normalized frame events over WebSocket.',
  },
  {
    id: 'polling-fallback',
    label: 'Polling fallback adapter',
    kind: 'polling',
    enabled: true,
    notes: 'Snapshot polling remains available whenever the live stream degrades.',
  },
]

function normalizeReplayBundle(bundle: ReplayBundle | LiveSystemReplayResponse | null): LiveSystemReplayResponse | null {
  if (!bundle) return null
  if ('consistent' in bundle) return bundle
  return {
    decisionFrameId: bundle.decisionFrameId,
    persisted: bundle.persisted,
    replay: bundle.replay,
    consistent: bundle.deterministicMatch,
    deterministicMatch: bundle.deterministicMatch,
    traceBacked: Boolean(bundle.persisted),
    legacy: bundle.persisted == null,
    mismatches: [],
    replayedAt: bundle.replayedAt,
  }
}

function normalizeWorkloadClass(value: string | null | undefined): WorkloadClass {
  if (
    value === 'batch' ||
    value === 'interactive' ||
    value === 'critical' ||
    value === 'regulated' ||
    value === 'emergency'
  ) {
    return value
  }
  return 'batch'
}

function getReplayRecord(replay: LiveSystemReplayResponse | null): CiRouteResponse | null {
  return replay?.persisted ?? replay?.replay ?? null
}

function buildFallbackExplanation(decision: CommandCenterDecisionItem): HallOGridFrame['explanation'] {
  const label = humanizeReasonCode(decision.reasonCode)
  const created = new Date(decision.createdAt)
  const stamp = Number.isNaN(created.getTime())
    ? decision.createdAt
    : created.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      })
  return {
    headline: `${label} | ${decision.selectedRegion} | ${stamp}`,
    dominantConstraint: `${decision.action.replace(/_/g, ' ')} via ${decision.selectedRegion}`,
    counterfactual: 'Trace-backed counterfactual becomes available when the replay payload is present.',
  }
}

function buildFallbackTrust(decision: CommandCenterDecisionItem): HallOGridFrame['trust'] {
  if (decision.fallbackUsed) {
    return {
      tier: 'guarded',
      freshnessLabel: 'Fallback mode engaged',
      replayability: decision.traceAvailable ? 'Replay opens on demand from trace-backed state.' : 'Replay unavailable.',
      degraded: true,
      summary: 'This frame entered guarded mode because the runtime used a fallback execution posture.',
    }
  }

  return {
    tier: 'medium',
    freshnessLabel: 'Mirror freshness unavailable',
    replayability: decision.traceAvailable ? 'Replay available on inspect.' : 'Replay unavailable.',
    degraded: false,
    summary: 'HallOGrid has frame identity and routing posture, but detailed trust data is not loaded yet.',
  }
}

function buildExplanation(
  decision: CommandCenterDecisionItem,
  explanation: DecisionExplanationContract | null | undefined
): HallOGridFrame['explanation'] {
  if (!explanation) return buildFallbackExplanation(decision)
  return {
    headline: explanation.whyAction,
    dominantConstraint: explanation.dominantConstraint,
    counterfactual: explanation.counterfactualCondition,
  }
}

function buildTrust(
  decision: CommandCenterDecisionItem,
  trust: DecisionTrustContract | null | undefined
): HallOGridFrame['trust'] {
  if (!trust) return buildFallbackTrust(decision)

  const carbonFreshness = formatFreshness(trust.signalFreshness.carbonFreshnessSec)
  const waterFreshness = formatFreshness(trust.signalFreshness.waterFreshnessSec)

  return {
    tier: trust.providerTrust.providerTrustTier,
    freshnessLabel: `Carbon ${carbonFreshness} | Water ${waterFreshness}`,
    replayability: trust.replayability.summary,
    degraded: trust.degradedState.degraded,
    summary: trust.degradedState.degraded
      ? trust.degradedState.summary
      : trust.fallbackMode.engaged
        ? trust.fallbackMode.summary
        : `${trust.providerTrust.carbonProvider} / ${trust.providerTrust.providerTrustTier}`,
  }
}

function buildFrame(
  decision: CommandCenterDecisionItem,
  detail?: {
    explanation?: DecisionExplanationContract | null
    trust?: DecisionTrustContract | null
    replay?: LiveSystemReplayResponse | null
  }
): HallOGridFrame {
  const replayRecord = getReplayRecord(detail?.replay ?? null)
  return {
    id: decision.decisionFrameId,
    createdAt: decision.createdAt,
    action: decision.action as HallOGridFrame['action'],
    region: decision.selectedRegion,
    reasonCode: decision.reasonCode,
    reasonLabel: humanizeReasonCode(decision.reasonCode),
    workloadClass: normalizeWorkloadClass(replayRecord?.workloadClass),
    proofState: decision.proofHash ? 'available' : 'unavailable',
    replayState:
      detail?.replay == null
        ? decision.traceAvailable
          ? 'pending'
          : 'unavailable'
        : detail.replay.deterministicMatch
          ? 'verified'
          : 'mismatch',
    traceState: decision.traceAvailable ? 'locked' : 'unavailable',
    governanceSource: decision.governanceSource,
    explanation: buildExplanation(decision, detail?.explanation),
    trust: buildTrust(decision, detail?.trust),
    metrics: {
      totalLatencyMs: decision.latencyTotalMs,
      computeLatencyMs: decision.latencyComputeMs,
      carbonReductionPct: replayRecord?.savings.carbonReductionPct ?? null,
      waterImpactDeltaLiters: replayRecord?.savings.waterImpactDeltaLiters ?? null,
      signalConfidence: replayRecord?.signalConfidence ?? null,
    },
    runtime: {
      signalMode: decision.signalMode,
      accountingMethod: decision.accountingMethod,
      waterAuthorityMode: decision.waterAuthorityMode,
      fallbackUsed: decision.fallbackUsed,
      systemState: decision.systemState,
    },
  }
}

function buildFrameDetail(
  decision: CommandCenterDecisionItem,
  trace: DecisionTraceRawRecord | null,
  replay: LiveSystemReplayResponse | null
): HallOGridFrameDetail {
  const replayRecord = getReplayRecord(replay)
  const explanation = replayRecord?.decisionExplanation ?? null
  const trust = replayRecord?.decisionTrust ?? null

  return {
    generatedAt: new Date().toISOString(),
    frame: buildFrame(decision, { explanation, trust, replay }),
    evidence: {
      trace: {
        available: Boolean(trace),
        hash: trace?.traceHash ?? null,
        inputHash: trace?.inputSignalHash ?? null,
        sequenceNumber: trace?.sequenceNumber ?? null,
        createdAt: trace?.createdAt ?? null,
        governanceSource: trace?.payload.governance.source ?? decision.governanceSource ?? null,
        constraintsApplied: trace?.payload.governance.constraintsApplied ?? [],
        candidates:
          trace?.payload.normalizedSignals.candidates.map((candidate) => ({
            region: candidate.region,
            score: candidate.score,
            waterStressIndex: candidate.waterStressIndex,
            cacheStatus: candidate.cacheStatus ?? null,
          })) ?? [],
      },
      replay: {
        available: Boolean(replay),
        deterministicMatch: replay?.deterministicMatch ?? null,
        traceBacked: replay?.traceBacked ?? Boolean(trace),
        mismatches: replay?.mismatches ?? [],
        selectedRegion: replay?.replay.selectedRegion ?? replay?.persisted?.selectedRegion ?? null,
        selectedAction: (replay?.replay.decision ??
          replay?.persisted?.decision ??
          null) as HallOGridFrameDetail['evidence']['replay']['selectedAction'],
        reasonCode: replay?.replay.reasonCode ?? replay?.persisted?.reasonCode ?? null,
        proofHash: replay?.replay.proofHash ?? replay?.persisted?.proofHash ?? null,
      },
      proof: {
        hash: trace?.payload.proof.proofHash ?? decision.proofHash ?? replayRecord?.proofHash ?? null,
        evidenceRefs: trace?.payload.proof.evidenceRefs ?? [],
        providerSnapshotRefs: trace?.payload.proof.providerSnapshotRefs ?? [],
        notBefore: trace?.payload.decisionPath.delayWindow.notBefore ?? replayRecord?.notBefore ?? null,
      },
    },
    explanation,
    trust,
  }
}

async function fetchFrameTrace(decisionFrameId: string) {
  if (!hasInternalApiKey()) return null
  try {
    return await fetchEngineJson<DecisionTraceRawRecord>(
      `/ci/decisions/${encodeURIComponent(decisionFrameId)}/trace/raw`,
      undefined,
      { internal: true }
    )
  } catch {
    return null
  }
}

async function fetchFrameReplay(decisionFrameId: string) {
  if (!hasInternalApiKey()) return null
  try {
    const bundle = await fetchEngineJson<ReplayBundle>(
      `/ci/decisions/${encodeURIComponent(decisionFrameId)}/replay`,
      undefined,
      { internal: true }
    )
    return normalizeReplayBundle(bundle)
  } catch {
    return null
  }
}

export async function getHallOGridFrameDetail(decisionFrameId: string): Promise<HallOGridFrameDetail | null> {
  const snapshot = await getCommandCenterSnapshot()
  const decision =
    snapshot.decisionCore.recentDecisions.find((item) => item.decisionFrameId === decisionFrameId) ?? null

  if (!decision) return null

  if (decisionFrameId === snapshot.selectedDecisionFrameId) {
    return buildFrameDetail(
      decision,
      snapshot.decisionCore.selectedTrace,
      normalizeReplayBundle(snapshot.decisionCore.selectedReplay)
    )
  }

  const [trace, replay] = await Promise.all([
    fetchFrameTrace(decisionFrameId),
    fetchFrameReplay(decisionFrameId),
  ])

  return buildFrameDetail(decision, trace, replay)
}

export async function getHallOGridSnapshot(): Promise<HallOGridSnapshot> {
  const snapshot = await getCommandCenterSnapshot()
  const selectedTrace = snapshot.decisionCore.selectedTrace
  const selectedReplay = normalizeReplayBundle(snapshot.decisionCore.selectedReplay)
  const selectedDecision = snapshot.decisionCore.selectedDecision
  const sortedDecisions = [...snapshot.decisionCore.recentDecisions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  return {
    generatedAt: snapshot.generatedAt,
    selectedFrameId: snapshot.selectedDecisionFrameId,
    title: 'CO2 Router Console',
    subtitle: 'Powered by HallOGrid',
    projection: snapshot.projection,
    selectedFrame:
      selectedDecision != null ? buildFrameDetail(selectedDecision, selectedTrace, selectedReplay) : null,
    frames: sortedDecisions.map((decision) =>
      buildFrame(
        decision,
        decision.decisionFrameId === snapshot.selectedDecisionFrameId
          ? {
              explanation: getReplayRecord(selectedReplay)?.decisionExplanation ?? null,
              trust: getReplayRecord(selectedReplay)?.decisionTrust ?? null,
              replay: selectedReplay,
            }
          : undefined
      )
    ),
    world: snapshot.world,
    governance:
      snapshot.governance.source || selectedDecision == null
        ? snapshot.governance
        : {
            ...snapshot.governance,
            source: selectedDecision.governanceSource,
            active: selectedDecision.governanceSource !== 'NONE',
          },
    traceStream: snapshot.traceStream,
    health: snapshot.health,
    transport: {
      mode: 'snapshot+stream',
      streamHealthy: snapshot.projection.dataStatus !== 'broken',
      snapshotUrl: '/api/control-surface/hallogrid',
      streamUrl: '/api/control-surface/hallogrid/stream',
      adapters: HALLOGRID_ADAPTERS,
    },
  }
}
