'use client'

import clsx from 'clsx'
import { formatDistanceToNowStrict } from 'date-fns'
import { motion } from 'framer-motion'
import {
  Activity,
  ChevronRight,
  GitBranch,
  Globe2,
  Lock,
  Radar,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { ACTION_META } from '@/components/control-surface/action-styles'
import { FALLBACK_COMMAND_CENTER_SNAPSHOT } from '@/lib/control-surface/fallbacks'
import {
  useCommandCenterSnapshot,
  useDecisionTrace,
  useReplayBundle,
} from '@/lib/hooks/control-surface'
import type {
  CommandCenterDecisionItem,
  CommandCenterSnapshot,
  ControlSurfaceProviderNode,
  DecisionTraceRawRecord,
  LiveSystemReplayResponse,
  SaiqGovernanceSnapshot,
  TraceEventItem,
  WorldRegionState,
  WorldRoutingFlow,
  WorldExecutionState,
} from '@/types/control-surface'

function shortHash(value: string | null | undefined, length = 12) {
  if (!value) return 'Unavailable'
  return value.length <= length ? value : `${value.slice(0, length)}…`
}

function formatAgo(timestamp: string) {
  try {
    return formatDistanceToNowStrict(new Date(timestamp), { addSuffix: true })
  } catch {
    return timestamp
  }
}

function formatSecondsCompact(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return 'Unavailable'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`
  return `${(seconds / 86400).toFixed(seconds >= 86400 * 10 ? 0 : 1)}d`
}

function resolveActionMeta(action: string) {
  return ACTION_META[(action in ACTION_META ? action : 'run_now') as keyof typeof ACTION_META]
}

function getStatusTone(state: WorldExecutionState) {
  if (state === 'active') return 'border-emerald-400/35 bg-emerald-400/10 text-emerald-200'
  if (state === 'blocked') return 'border-rose-400/35 bg-rose-400/10 text-rose-200'
  return 'border-amber-400/35 bg-amber-400/10 text-amber-100'
}

function deriveHeader(
  snapshot: CommandCenterSnapshot,
  selectedTrace: DecisionTraceRawRecord | null,
  selectedReplay: LiveSystemReplayResponse | null
) {
  return {
    systemActive: snapshot.health.service.status === 'healthy',
    systemStatus: snapshot.health.service.status,
    saiqEnforced: selectedTrace ? selectedTrace.payload.governance.source !== 'NONE' : null,
    traceLocked: selectedTrace ? Boolean(selectedTrace.traceHash) : null,
    replayVerified: selectedReplay?.deterministicMatch ?? null,
    detail: snapshot.header.detail,
  }
}

function deriveGovernance(
  snapshot: CommandCenterSnapshot,
  selectedTrace: DecisionTraceRawRecord | null,
  selectedReplay: LiveSystemReplayResponse | null
): SaiqGovernanceSnapshot {
  if (!selectedTrace) return snapshot.governance

  const traceThresholds = selectedTrace.payload.governance.thresholds
  const thresholdsSource =
    (traceThresholds && typeof traceThresholds === 'object' ? traceThresholds : undefined) ??
    (selectedReplay?.persisted?.policyTrace?.thresholds as Record<string, unknown> | undefined) ??
    (selectedReplay?.replay.policyTrace?.thresholds as Record<string, unknown> | undefined)

  const thresholds =
    thresholdsSource && typeof thresholdsSource === 'object'
      ? Object.fromEntries(
          Object.entries(thresholdsSource)
            .filter(([, value]) => typeof value === 'number')
            .map(([key, value]) => [key, value as number | null])
        )
      : null

  const traceWeights = selectedTrace.payload.governance.weights
  const weights =
    traceWeights &&
    (typeof traceWeights.carbon === 'number' ||
      typeof traceWeights.water === 'number' ||
      typeof traceWeights.latency === 'number' ||
      typeof traceWeights.cost === 'number')
      ? {
          carbon: typeof traceWeights.carbon === 'number' ? traceWeights.carbon : null,
          water: typeof traceWeights.water === 'number' ? traceWeights.water : null,
          latency: typeof traceWeights.latency === 'number' ? traceWeights.latency : null,
          cost: typeof traceWeights.cost === 'number' ? traceWeights.cost : null,
        }
      : null

  const selectedScore =
    selectedTrace.payload.governance.score ??
    selectedTrace.payload.normalizedSignals.candidates.find(
      (candidate) => candidate.region === selectedTrace.payload.decisionPath.selectedRegion
    )?.score ??
    null

  return {
    frameworkLabel: 'SAIQ',
    source: selectedTrace.payload.governance.source,
    active: selectedTrace.payload.governance.source !== 'NONE',
    strict: selectedTrace.payload.governance.strict,
    enforcementMode: selectedTrace.payload.decisionPath.operatingMode,
    selectedScore,
    thresholds: thresholds && Object.keys(thresholds).length ? thresholds : null,
    weights,
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
      constraintsApplied: selectedTrace.payload.governance.constraintsApplied.length,
      cacheHit: selectedTrace.payload.performance.cacheHit,
    },
  }
}

function resolveRegionAnchor(region: string, index: number) {
  const anchors: Record<string, { x: number; y: number; label: string }> = {
    'us-west-2': { x: 14, y: 25, label: 'US West 2' },
    'us-west-1': { x: 17, y: 28, label: 'US West 1' },
    'us-east-2': { x: 28, y: 23, label: 'US East 2' },
    'us-east-1': { x: 31, y: 26, label: 'US East 1' },
    'eu-west-1': { x: 50, y: 22, label: 'EU West 1' },
    'eu-central-1': { x: 56, y: 23, label: 'EU Central 1' },
    'eu-north-1': { x: 57, y: 16, label: 'EU North 1' },
    'ap-southeast-1': { x: 79, y: 34, label: 'AP SouthEast 1' },
    'ap-northeast-1': { x: 83, y: 18, label: 'AP NorthEast 1' },
  }

  if (anchors[region]) return { region, ...anchors[region] }

  return {
    region,
    label: region,
    x: 14 + ((index % 6) * 14),
    y: 47 + Math.floor(index / 6) * 7,
  }
}

function deriveWorldModel(
  decisions: CommandCenterDecisionItem[],
  selectedTrace: DecisionTraceRawRecord | null,
  selectedReplay: LiveSystemReplayResponse | null
): { nodes: WorldRegionState[]; flows: WorldRoutingFlow[] } {
  const regionMap = new Map<string, CommandCenterDecisionItem>()
  decisions.forEach((decision) => {
    if (!regionMap.has(decision.selectedRegion)) {
      regionMap.set(decision.selectedRegion, decision)
    }
  })

  const baselineRegion = selectedReplay?.persisted?.baseline.region ?? selectedReplay?.replay.baseline.region ?? null
  if (baselineRegion && !regionMap.has(baselineRegion)) {
    const selected = decisions.find((decision) => decision.decisionFrameId === selectedTrace?.decisionFrameId) ?? decisions[0]
    if (selected) {
      regionMap.set(baselineRegion, {
        ...selected,
        selectedRegion: baselineRegion,
        systemState: 'marginal',
      })
    }
  }

  const nodes = Array.from(regionMap.values()).map((decision, index) => {
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

  const selectedAction = selectedReplay?.persisted?.decision ?? selectedReplay?.replay.decision ?? null
  const selectedRegion = selectedReplay?.persisted?.selectedRegion ?? selectedReplay?.replay.selectedRegion ?? null
  const flows =
    baselineRegion && selectedRegion && selectedAction
      ? [
          {
            id: `${baselineRegion}:${selectedRegion}:${selectedAction}`,
            fromRegion: baselineRegion,
            toRegion: selectedRegion,
            mode: selectedAction === 'run_now' || selectedAction === 'reroute' ? 'route' : 'blocked',
          } satisfies WorldRoutingFlow,
        ]
      : []

  return { nodes, flows }
}

function deriveTraceItems(
  items: CommandCenterDecisionItem[],
  selectedFrameId: string | null,
  selectedReplay: LiveSystemReplayResponse | null
): TraceEventItem[] {
  return items.map((decision) => ({
    decisionFrameId: decision.decisionFrameId,
    createdAt: decision.createdAt,
    action: decision.action,
    region: decision.selectedRegion,
    reasonCode: decision.reasonCode,
    proofAvailable: Boolean(decision.proofHash),
    traceAvailable: decision.traceAvailable,
    governanceSource: decision.governanceSource,
    replayVerified:
      decision.decisionFrameId === selectedFrameId ? selectedReplay?.deterministicMatch ?? null : null,
  }))
}

function useDesktopBreakpoint(minWidth = 1280) {
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia(`(min-width: ${minWidth}px)`)
    const update = () => setIsDesktop(mediaQuery.matches)

    update()
    mediaQuery.addEventListener('change', update)

    return () => {
      mediaQuery.removeEventListener('change', update)
    }
  }, [minWidth])

  return isDesktop
}

function MetricChip({
  icon: Icon,
  label,
  state,
}: {
  icon: typeof ShieldCheck
  label: string
  state: boolean | null
}) {
  return (
    <div
      className={clsx(
        'flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em]',
        state == null
          ? 'border-white/12 bg-white/[0.04] text-slate-300'
          : state
            ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
            : 'border-rose-400/30 bg-rose-400/10 text-rose-200'
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
      <span className="text-[10px] tracking-[0.24em] text-white/75">
        {state == null ? 'UNAVAILABLE' : state ? 'LOCKED' : 'OFF'}
      </span>
    </div>
  )
}

function GlobalCommandHeader({
  snapshot,
  selectedTrace,
  selectedReplay,
}: {
  snapshot: CommandCenterSnapshot
  selectedTrace: DecisionTraceRawRecord | null
  selectedReplay: LiveSystemReplayResponse | null
}) {
  const header = deriveHeader(snapshot, selectedTrace, selectedReplay)

  return (
    <section className="rounded-[30px] border border-cyan-300/14 bg-[linear-gradient(135deg,rgba(5,15,33,0.98),rgba(3,7,18,0.94))] p-5 shadow-[0_40px_160px_rgba(2,6,23,0.62)]">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.28em] text-cyan-300">
            <Radar className="h-4 w-4" />
            <span>Command Center</span>
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-[-0.05em] text-white sm:text-5xl">
              Active global execution authority.
            </h1>
            <p className="mt-3 max-w-4xl text-sm text-slate-300">
              Decisions are issued before execution, water can block workloads, every frame is traceable,
              and replay stays pinned to the original decision inputs.
            </p>
          </div>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-3 text-right">
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Live posture</div>
          <div className="mt-2 text-lg font-semibold text-white">
            {header.systemStatus.toUpperCase()}
          </div>
          <div className="mt-2 max-w-sm text-xs text-slate-400">{header.detail}</div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <MetricChip icon={Activity} label="System Active" state={header.systemActive} />
        <MetricChip icon={ShieldCheck} label="SAIQ Enforced" state={header.saiqEnforced} />
        <MetricChip icon={Lock} label="Trace Locked" state={header.traceLocked} />
        <MetricChip icon={RefreshCw} label="Replay Verified" state={header.replayVerified} />
      </div>
    </section>
  )
}

function WorldExecutionGrid({
  model,
  selectedFrameId,
  onSelectFrame,
}: {
  model: { nodes: WorldRegionState[]; flows: WorldRoutingFlow[] }
  selectedFrameId: string | null
  onSelectFrame: (decisionFrameId: string) => void
}) {
  const nodeMap = new Map(model.nodes.map((node) => [node.region, node]))

  function buildPath(flow: WorldRoutingFlow) {
    const from = nodeMap.get(flow.fromRegion)
    const to = nodeMap.get(flow.toRegion)
    if (!from || !to) return ''
    const controlX = (from.x + to.x) / 2
    const controlY = Math.min(from.y, to.y) - 10
    return `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`
  }

  return (
    <div className="relative overflow-hidden rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.08),transparent_35%),linear-gradient(180deg,rgba(2,6,23,0.96),rgba(2,8,23,0.88))] p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">World execution grid</div>
          <div className="mt-1 text-lg font-semibold text-white">Live routing posture by region.</div>
        </div>
        <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-slate-300">
          {model.nodes.length} live regions
        </div>
      </div>

      <div className="relative min-h-[420px] rounded-[28px] border border-white/8 bg-slate-950/70">
        <svg viewBox="0 0 100 60" className="absolute inset-0 h-full w-full">
          <defs>
            <linearGradient id="command-flow" x1="0%" x2="100%">
              <stop offset="0%" stopColor="rgba(34,211,238,0.2)" />
              <stop offset="50%" stopColor="rgba(45,212,191,0.95)" />
              <stop offset="100%" stopColor="rgba(132,204,22,0.3)" />
            </linearGradient>
            <linearGradient id="blocked-flow" x1="0%" x2="100%">
              <stop offset="0%" stopColor="rgba(251,113,133,0.15)" />
              <stop offset="50%" stopColor="rgba(244,63,94,0.95)" />
              <stop offset="100%" stopColor="rgba(251,191,36,0.15)" />
            </linearGradient>
          </defs>

          {Array.from({ length: 5 }).map((_, index) => (
            <line
              key={`lat-${index}`}
              x1={0}
              y1={10 + index * 10}
              x2={100}
              y2={10 + index * 10}
              stroke="rgba(148,163,184,0.08)"
              strokeWidth="0.22"
            />
          ))}
          {Array.from({ length: 6 }).map((_, index) => (
            <line
              key={`lon-${index}`}
              x1={10 + index * 15}
              y1={0}
              x2={10 + index * 15}
              y2={60}
              stroke="rgba(148,163,184,0.08)"
              strokeWidth="0.22"
            />
          ))}

          <path d="M8 18C13 14 24 13 31 17C34 19 34 24 28 26C20 29 10 28 7 24C5 22 5 20 8 18Z" fill="rgba(15,23,42,0.92)" stroke="rgba(56,189,248,0.09)" strokeWidth="0.4" />
          <path d="M42 14C48 10 59 11 63 16C67 21 65 26 58 28C49 31 41 28 39 22C38 19 39 16 42 14Z" fill="rgba(15,23,42,0.92)" stroke="rgba(56,189,248,0.09)" strokeWidth="0.4" />
          <path d="M69 18C74 15 84 16 88 20C91 23 89 28 84 30C78 33 70 32 67 27C65 24 66 20 69 18Z" fill="rgba(15,23,42,0.92)" stroke="rgba(56,189,248,0.09)" strokeWidth="0.4" />
          <path d="M77 37C81 34 87 34 90 38C92 41 90 45 86 47C81 49 76 48 74 44C73 41 74 39 77 37Z" fill="rgba(15,23,42,0.92)" stroke="rgba(56,189,248,0.09)" strokeWidth="0.4" />

          {model.flows.map((flow) => {
            const path = buildPath(flow)
            if (!path) return null
            const stroke = flow.mode === 'route' ? 'url(#command-flow)' : 'url(#blocked-flow)'
            return (
              <motion.path
                key={flow.id}
                d={path}
                fill="none"
                stroke={stroke}
                strokeWidth="1.25"
                strokeLinecap="round"
                initial={{ pathLength: 0.2, opacity: 0.5 }}
                animate={{ pathLength: 1, opacity: [0.45, 1, 0.45] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: 'linear' }}
              />
            )
          })}

          {model.nodes.map((node) => {
            const selected = node.decisionFrameId === selectedFrameId
            const nodeTone =
              node.state === 'active'
                ? 'rgba(34,197,94,0.95)'
                : node.state === 'blocked'
                  ? 'rgba(244,63,94,0.95)'
                  : 'rgba(250,204,21,0.95)'
            return (
              <g
                key={node.region}
                onClick={() => node.decisionFrameId && onSelectFrame(node.decisionFrameId)}
                className={clsx(node.decisionFrameId ? 'cursor-pointer' : 'pointer-events-none')}
              >
                <motion.circle
                  cx={node.x}
                  cy={node.y}
                  r={selected ? 2.6 : 1.9}
                  fill={nodeTone}
                  stroke="rgba(255,255,255,0.85)"
                  strokeWidth="0.35"
                  animate={{ opacity: [0.65, 1, 0.65] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                />
                <circle cx={node.x} cy={node.y} r={selected ? 4.2 : 3.2} fill="none" stroke={nodeTone} strokeWidth="0.25" opacity={selected ? 0.75 : 0.34} />
                <text x={node.x + 1.6} y={node.y - 1.8} fill="rgba(226,232,240,0.88)" fontSize="2.5" fontWeight="600">
                  {node.label}
                </text>
              </g>
            )
          })}
        </svg>

        <div className="pointer-events-none absolute inset-x-5 bottom-5 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.22em]">
          <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-emerald-200">Green active</div>
          <div className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-amber-100">Yellow marginal</div>
          <div className="rounded-full border border-rose-400/20 bg-rose-400/10 px-3 py-1 text-rose-200">Red blocked</div>
        </div>
      </div>
    </div>
  )
}

function DecisionPipelineRail({
  selectedTrace,
  governance,
  selectedDecision,
}: {
  selectedTrace: DecisionTraceRawRecord | null
  governance: SaiqGovernanceSnapshot
  selectedDecision: CommandCenterDecisionItem | null
}) {
  const stages = [
    { label: 'Signals', value: selectedTrace ? `${selectedTrace.payload.normalizedSignals.candidates.length} candidates` : 'Unavailable' },
    { label: 'SAIQ', value: governance.source ?? 'Unavailable' },
    { label: 'Policy', value: governance.enforcementMode ?? 'Unavailable' },
    { label: 'Decision', value: selectedDecision ? resolveActionMeta(selectedDecision.action).label : 'Unavailable' },
    { label: 'Proof', value: selectedDecision?.proofHash ? shortHash(selectedDecision.proofHash, 10) : 'Unavailable' },
  ]

  return (
    <div className="mt-5 grid gap-3 lg:grid-cols-[repeat(5,minmax(0,1fr))]">
      {stages.map((stage, index) => (
        <div key={stage.label} className="relative overflow-hidden rounded-[20px] border border-white/10 bg-white/[0.04] p-3">
          <motion.div
            className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent"
            animate={{ x: ['-100%', '100%'] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'linear', delay: index * 0.12 }}
          />
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{stage.label}</div>
          <div className="mt-2 text-sm font-semibold text-white">{stage.value}</div>
        </div>
      ))}
    </div>
  )
}

function DecisionEngineCore({
  selectedDecision,
  selectedTrace,
  selectedReplay,
  governance,
}: {
  selectedDecision: CommandCenterDecisionItem | null
  selectedTrace: DecisionTraceRawRecord | null
  selectedReplay: LiveSystemReplayResponse | null
  governance: SaiqGovernanceSnapshot
}) {
  const meta = selectedDecision ? resolveActionMeta(selectedDecision.action) : resolveActionMeta('run_now')

  return (
    <div className="relative z-10 rounded-[32px] border border-white/12 bg-[linear-gradient(180deg,rgba(5,15,33,0.88),rgba(2,6,23,0.95))] p-5 shadow-[0_24px_100px_rgba(0,0,0,0.45)] backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Decision core</div>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">
            {selectedDecision ? resolveActionMeta(selectedDecision.action).label : 'Awaiting frame'}
          </h2>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-300">
            <span className={clsx('rounded-full border px-3 py-1', meta.badge, meta.border)}>
              {selectedDecision?.selectedRegion ?? 'No region'}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
              {selectedDecision?.reasonCode ?? 'No decision selected'}
            </span>
          </div>
        </div>
        <div className="grid gap-2 text-right text-xs text-slate-300">
          <div>Proof {shortHash(selectedDecision?.proofHash)}</div>
          <div>Trace {selectedDecision?.traceAvailable ? 'locked' : 'unavailable'}</div>
          <div>Replay {selectedReplay ? (selectedReplay.deterministicMatch ? 'verified' : 'mismatch') : 'unavailable'}</div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
        <div className={clsx('rounded-[26px] border bg-white/[0.03] p-5', meta.border, meta.glow)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Decision frame</div>
              <div className="mt-2 font-mono text-sm text-white">{selectedDecision?.decisionFrameId ?? 'Unavailable'}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Latency</div>
              <div className="mt-2 text-sm text-white">
                {selectedDecision?.latencyTotalMs?.toFixed(0) ?? '--'}ms total / {selectedDecision?.latencyComputeMs?.toFixed(0) ?? '--'}ms compute
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Baseline region</div>
              <div className="mt-2 text-sm text-white">{selectedReplay?.persisted?.baseline.region ?? selectedReplay?.replay.baseline.region ?? 'Unavailable'}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Water authority</div>
              <div className="mt-2 text-sm text-white">{selectedDecision?.waterAuthorityMode ?? 'Unavailable'}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">SAIQ source</div>
              <div className="mt-2 text-sm text-white">{governance.source ?? 'Unavailable'}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Selected score</div>
              <div className="mt-2 text-sm text-white">{governance.selectedScore != null ? governance.selectedScore.toFixed(3) : 'Unavailable'}</div>
            </div>
          </div>
        </div>

        <div className="rounded-[26px] border border-white/10 bg-white/[0.03] p-5">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Authority path</div>
          <div className="mt-2 text-lg font-semibold text-white">{selectedDecision?.reasonCode ?? 'No active decision'}</div>
          <div className="mt-4 space-y-2 text-sm text-slate-300">
            <div>Action: <span className={meta.text}>{meta.label}</span></div>
            <div>Signal posture: {selectedDecision?.signalMode ?? 'Unavailable'} / accounting {selectedDecision?.accountingMethod ?? 'Unavailable'}</div>
            <div>Water can block: {selectedDecision?.systemState === 'blocked' ? 'yes' : 'not on current frame'}</div>
            <div>Constraints applied: {governance.impact.constraintsApplied}</div>
          </div>
        </div>
      </div>

      <DecisionPipelineRail selectedTrace={selectedTrace} governance={governance} selectedDecision={selectedDecision} />
    </div>
  )
}

function SaiqGovernanceEngine({ governance }: { governance: SaiqGovernanceSnapshot }) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(4,10,24,0.96),rgba(3,9,20,0.92))] p-5">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-5 w-5 text-cyan-300" />
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">SAIQ governance layer</div>
          <div className="mt-1 text-lg font-semibold text-white">Weighted execution authority.</div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">State</div>
          <div className="mt-2 text-sm text-white">Source: {governance.source ?? 'Unavailable'}</div>
          <div className="mt-1 text-sm text-white">
            Strict: {governance.strict == null ? 'Unavailable' : governance.strict ? 'On' : 'Off'}
          </div>
          <div className="mt-1 text-sm text-white">Mode: {governance.enforcementMode ?? 'Unavailable'}</div>
          <div className="mt-3 text-3xl font-black tracking-[-0.05em] text-cyan-200">
            {governance.selectedScore != null ? governance.selectedScore.toFixed(3) : '---'}
          </div>
        </div>

        <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">SAIQ Weights</div>
          {governance.weights ? (
            <div className="mt-3 grid gap-2 text-sm text-slate-200">
              <div>Carbon {governance.weights.carbon?.toFixed(2) ?? 'Unavailable'}</div>
              <div>Water {governance.weights.water?.toFixed(2) ?? 'Unavailable'}</div>
              <div>Latency {governance.weights.latency?.toFixed(2) ?? 'Unavailable'}</div>
              <div>Cost {governance.weights.cost?.toFixed(2) ?? 'Unavailable'}</div>
            </div>
          ) : (
            <div className="mt-3 space-y-1 text-sm text-slate-400">
              <div>Unavailable</div>
              <div>Not exposed by current live decision payload</div>
            </div>
          )}
        </div>

        <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Thresholds</div>
          {governance.thresholds ? (
            <div className="mt-3 grid gap-2 text-sm text-slate-200">
              {Object.entries(governance.thresholds).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <span className="text-slate-400">{key}</span>
                  <span>{value != null ? value.toFixed(2) : 'Unavailable'}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 text-sm text-slate-400">Unavailable</div>
          )}
        </div>

        <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Impact</div>
          <div className="mt-3 grid gap-2 text-sm text-slate-200">
            <div>Carbon delta {governance.impact.carbonReductionPct?.toFixed(1) ?? '--'}%</div>
            <div>Water delta {governance.impact.waterImpactDeltaLiters?.toFixed(2) ?? '--'} L</div>
            <div>Signal confidence {governance.impact.signalConfidence?.toFixed(2) ?? '--'}</div>
            <div>Constraints {governance.impact.constraintsApplied}</div>
            <div>Cache hit {governance.impact.cacheHit == null ? 'Unavailable' : governance.impact.cacheHit ? 'yes' : 'no'}</div>
          </div>
        </div>
      </div>
    </section>
  )
}

function SystemHealthPanel({ providers, snapshot }: { providers: ControlSurfaceProviderNode[]; snapshot: CommandCenterSnapshot['health'] }) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(4,10,24,0.96),rgba(3,9,20,0.92))] p-5">
      <div className="flex items-center gap-3">
        <Activity className="h-5 w-5 text-emerald-300" />
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">System health</div>
          <div className="mt-1 text-lg font-semibold text-white">Latency, provenance, and signal state.</div>
        </div>
      </div>

      <div className="mt-5 rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Latency</div>
        <div className="mt-3 grid gap-2 text-sm text-slate-200">
          <div>Samples {snapshot.latency.samples ?? 'Unavailable'}</div>
          <div>p95 total {snapshot.latency.p95TotalMs?.toFixed(0) ?? '--'} ms</div>
          <div>p95 compute {snapshot.latency.p95ComputeMs?.toFixed(0) ?? '--'} ms</div>
          <div>Budget {snapshot.latency.budgetTotalP95Ms ?? '--'} / {snapshot.latency.budgetComputeP95Ms ?? '--'} ms</div>
        </div>
      </div>

      <div className="mt-4 rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Provenance</div>
        <div className="mt-3 grid gap-2 text-sm">
          {snapshot.provenance.datasets.map((dataset) => (
            <div key={dataset.name} className="flex items-center justify-between gap-3">
              <span className="uppercase tracking-[0.16em] text-slate-400">{dataset.name}</span>
              <span className="text-white">{dataset.verificationStatus}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Providers</div>
        {providers.length ? (
          <div className="mt-3 space-y-2">
            {providers.slice(0, 6).map((provider) => (
              <div key={provider.id} className="rounded-[16px] border border-white/8 bg-slate-950/60 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-white">{provider.label}</div>
                  <span className={clsx('rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em]', getStatusTone(provider.status === 'healthy' ? 'active' : provider.status === 'offline' ? 'blocked' : 'marginal'))}>
                    {provider.statusLabel ?? provider.status}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {provider.providerType === 'water'
                    ? `bundle age ${formatSecondsCompact(provider.freshnessSec)} / ttl ${formatSecondsCompact(provider.ttlSec)}`
                    : `staleness ${formatSecondsCompact(provider.freshnessSec)} / latency ${provider.latencyMs != null ? `${provider.latencyMs}ms` : 'unavailable'}`}
                </div>
                {provider.providerType === 'water' ? (
                  <div className="mt-1 text-xs text-slate-500">
                    provenance {provider.provenanceStatus ?? 'unavailable'}
                  </div>
                ) : null}
                {provider.degradedReason ? (
                  <div className="mt-1 text-xs text-amber-200/90">{provider.degradedReason}</div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-[16px] border border-white/8 bg-slate-950/60 px-3 py-3 text-sm leading-7 text-slate-300">
            Live provider state is hydrating. The command-center shell stays resolved while the
            active signal window attaches.
          </div>
        )}
      </div>
    </section>
  )
}

function TraceEventStream({
  items,
  selectedFrameId,
  onSelect,
  onInspect,
  onReplay,
  onProof,
}: {
  items: TraceEventItem[]
  selectedFrameId: string | null
  onSelect: (decisionFrameId: string) => void
  onInspect: (decisionFrameId: string) => void
  onReplay: (decisionFrameId: string) => void
  onProof: (decisionFrameId: string) => void
}) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(4,10,24,0.96),rgba(3,9,20,0.92))] p-5">
      <div className="flex items-center gap-3">
        <GitBranch className="h-5 w-5 text-cyan-300" />
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Trace event stream</div>
          <div className="mt-1 text-lg font-semibold text-white">Decision frames with proof and replay state.</div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {items.map((item) => {
          const selected = item.decisionFrameId === selectedFrameId
          const actionMeta = resolveActionMeta(item.action)
          return (
            <div
              key={item.decisionFrameId}
              className={clsx(
                'rounded-[20px] border p-4 transition',
                selected ? 'border-cyan-300/28 bg-cyan-300/7' : 'border-white/10 bg-white/[0.03]'
              )}
            >
              <button type="button" className="w-full text-left" onClick={() => onSelect(item.decisionFrameId)}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-xs text-slate-300">{item.decisionFrameId}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className={clsx('rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em]', actionMeta.badge, actionMeta.border)}>
                        {actionMeta.label}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-300">
                        {item.region}
                      </span>
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-400">{formatAgo(item.createdAt)}</div>
                </div>
              </button>

              <div className="mt-3 grid gap-2 text-xs text-slate-300">
                <div>Reason {item.reasonCode}</div>
                <div>Governance {item.governanceSource ?? 'Unavailable'}</div>
                <div>
                  Proof {item.proofAvailable ? 'available' : 'unavailable'} / Trace {item.traceAvailable ? 'locked' : 'unavailable'} / Replay {item.replayVerified == null ? 'on inspect' : item.replayVerified ? 'verified' : 'mismatch'}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-white" onClick={() => onInspect(item.decisionFrameId)}>
                  Inspect
                </button>
                <button type="button" className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-white" onClick={() => onReplay(item.decisionFrameId)}>
                  Replay
                </button>
                <button type="button" className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-white" onClick={() => onProof(item.decisionFrameId)}>
                  Proof
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function RecentDecisionQueue({
  items,
  selectedFrameId,
  onSelect,
}: {
  items: CommandCenterDecisionItem[]
  selectedFrameId: string | null
  onSelect: (decisionFrameId: string) => void
}) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(4,10,24,0.96),rgba(3,9,20,0.92))] p-5">
      <div className="flex items-center gap-3">
        <Globe2 className="h-5 w-5 text-lime-300" />
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Recent decision queue</div>
          <div className="mt-1 text-lg font-semibold text-white">Binding execution outcomes.</div>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {items.length ? items.map((item) => {
          const actionMeta = resolveActionMeta(item.action)
          return (
            <button
              key={item.decisionFrameId}
              type="button"
              onClick={() => onSelect(item.decisionFrameId)}
              className={clsx(
                'flex w-full items-center justify-between gap-3 rounded-[18px] border px-4 py-3 text-left transition',
                item.decisionFrameId === selectedFrameId ? 'border-cyan-300/28 bg-cyan-300/7' : 'border-white/10 bg-white/[0.03]'
              )}
            >
              <div className="min-w-0">
                <div className={clsx('text-sm font-semibold', actionMeta.text)}>{actionMeta.label}</div>
                <div className="mt-1 truncate text-xs text-slate-400">{item.selectedRegion} • {item.reasonCode}</div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
            </button>
          )
        }) : (
          <div className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-slate-300">
            The decision queue shell is ready. The first live execution frame will attach here
            without shifting the rest of the command center.
          </div>
        )}
      </div>
    </section>
  )
}

function DetailSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{title}</div>
      {description ? <div className="mt-1 text-xs text-slate-500">{description}</div> : null}
      <div className="mt-3">{children}</div>
    </section>
  )
}

function DecisionDetailPanel({
  selectedDecision,
  selectedTrace,
  selectedReplay,
  governance,
  proofHash,
  providerRefs,
  evidenceRefs,
  mobile,
}: {
  selectedDecision: CommandCenterDecisionItem | null
  selectedTrace: DecisionTraceRawRecord | null
  selectedReplay: LiveSystemReplayResponse | null
  governance: SaiqGovernanceSnapshot
  proofHash: string | null
  providerRefs: string[]
  evidenceRefs: string[]
  mobile?: boolean
}) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(4,10,24,0.98),rgba(2,8,23,0.94))] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-cyan-300">Selected decision detail</div>
          <div className="mt-1 text-lg font-semibold text-white">Persistent authority, trace, replay, and proof.</div>
          <div className="mt-2 text-sm text-slate-400">
            The selected outcome stays anchored here while you move through the decision queue.
          </div>
        </div>
        {mobile ? null : (
          <div className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-cyan-200">
            Anchored panel
          </div>
        )}
      </div>

      <div className="mt-5">
        <DecisionEngineCore
          selectedDecision={selectedDecision}
          selectedTrace={selectedTrace}
          selectedReplay={selectedReplay}
          governance={governance}
        />
      </div>

      <div className="mt-5 space-y-4">
        <DetailSection title="Trace ledger" description="Deterministic lineage for the selected execution frame.">
          {selectedTrace ? (
            <div className="grid gap-2 text-sm text-white">
              <div>Trace hash {selectedTrace.traceHash}</div>
              <div>Input hash {selectedTrace.inputSignalHash}</div>
              <div>Sequence {selectedTrace.sequenceNumber}</div>
              <div>Created {selectedTrace.createdAt}</div>
              <div>Source {selectedTrace.payload.governance.source}</div>
              <div>Constraints {selectedTrace.payload.governance.constraintsApplied.join(', ') || 'none'}</div>
            </div>
          ) : (
            <div className="text-sm text-slate-300">Trace unavailable for the selected frame.</div>
          )}
        </DetailSection>

        <DetailSection title="Replay state" description="Stored outcome versus deterministic replay result.">
          {selectedReplay ? (
            <div className="grid gap-2 text-sm text-white">
              <div>Deterministic match {selectedReplay.deterministicMatch ? 'yes' : 'no'}</div>
              <div>Trace backed {selectedReplay.traceBacked ? 'yes' : 'no'}</div>
              <div>Legacy {selectedReplay.legacy ? 'yes' : 'no'}</div>
              <div>Mismatches {selectedReplay.mismatches.length ? selectedReplay.mismatches.join(', ') : 'none'}</div>
              <div>Action {selectedReplay.persisted?.decision ?? 'Unavailable'} / {selectedReplay.replay.decision}</div>
              <div>Region {selectedReplay.persisted?.selectedRegion ?? 'Unavailable'} / {selectedReplay.replay.selectedRegion}</div>
              <div>Reason {selectedReplay.persisted?.reasonCode ?? 'Unavailable'} / {selectedReplay.replay.reasonCode}</div>
            </div>
          ) : (
            <div className="text-sm text-slate-300">Replay unavailable for the selected frame.</div>
          )}
        </DetailSection>

        <DetailSection title="Proof references" description="Proof record, provider snapshots, and water evidence for the selected frame.">
          <div className="space-y-4 text-sm text-white">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Proof reference</div>
              <div className="mt-2 font-mono">{proofHash ?? 'Unavailable'}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Provider snapshot refs</div>
              <div className="mt-2 space-y-2">
                {providerRefs.length ? providerRefs.map((ref) => <div key={ref}>{ref}</div>) : <div>Unavailable</div>}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Water evidence refs</div>
              <div className="mt-2 space-y-2">
                {evidenceRefs.length ? evidenceRefs.map((ref) => <div key={ref}>{ref}</div>) : <div>Unavailable</div>}
              </div>
            </div>
          </div>
        </DetailSection>
      </div>
    </section>
  )
}

function DecisionDetailSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/88 backdrop-blur-sm xl:hidden">
      <div className="h-full w-full overflow-y-auto bg-[linear-gradient(180deg,rgba(4,10,24,0.98),rgba(2,8,23,0.98))] p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-cyan-300">Mobile detail sheet</div>
            <h3 className="mt-1 text-xl font-semibold text-white">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs uppercase tracking-[0.18em] text-slate-300"
          >
            Back
          </button>
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}

export function CommandCenterShell() {
  const snapshotQuery = useCommandCenterSnapshot()
  const snapshot = snapshotQuery.data ?? FALLBACK_COMMAND_CENTER_SNAPSHOT
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  const isDesktop = useDesktopBreakpoint()

  useEffect(() => {
    if (!snapshot) return
    const exists = snapshot.decisionCore.recentDecisions.some((decision) => decision.decisionFrameId === selectedFrameId)
    if (!selectedFrameId || !exists) {
      setSelectedFrameId(snapshot.selectedDecisionFrameId)
    }
  }, [selectedFrameId, snapshot])

  const isLatestSelected = Boolean(snapshot?.selectedDecisionFrameId && selectedFrameId === snapshot.selectedDecisionFrameId)

  const selectedTraceQuery = useDecisionTrace(selectedFrameId, {
    enabled: Boolean(selectedFrameId) && !isLatestSelected,
    refetchInterval: false,
  })
  const selectedReplayQuery = useReplayBundle(selectedFrameId, {
    enabled: Boolean(selectedFrameId) && !isLatestSelected,
    refetchInterval: false,
  })

  const selectedDecision = useMemo(() => {
    if (!snapshot || !selectedFrameId) return null
    return snapshot.decisionCore.recentDecisions.find((decision) => decision.decisionFrameId === selectedFrameId) ?? null
  }, [selectedFrameId, snapshot])

  const selectedTrace =
    isLatestSelected ? snapshot?.decisionCore.selectedTrace ?? null : selectedTraceQuery.data ?? null
  const selectedReplay =
    isLatestSelected
      ? snapshot?.decisionCore.selectedReplay ?? null
      : ((selectedReplayQuery.data as LiveSystemReplayResponse | null) ?? null)

  const governance = useMemo(
    () => deriveGovernance(snapshot, selectedTrace, selectedReplay),
    [selectedReplay, selectedTrace, snapshot]
  )

  const worldModel = useMemo(
    () => deriveWorldModel(snapshot.decisionCore.recentDecisions, selectedTrace, selectedReplay),
    [selectedReplay, selectedTrace, snapshot]
  )

  useEffect(() => {
    if (isDesktop) {
      setMobileDetailOpen(false)
      return
    }

    if (!mobileDetailOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isDesktop, mobileDetailOpen])

  const activeProofHash = selectedTrace?.payload.proof.proofHash ?? selectedDecision?.proofHash ?? null
  const activeEvidenceRefs = selectedTrace?.payload.proof.evidenceRefs ?? []
  const activeProviderRefs = selectedTrace?.payload.proof.providerSnapshotRefs ?? []

  const handleSelectDecision = (decisionFrameId: string) => {
    setSelectedFrameId(decisionFrameId)
    if (!isDesktop) {
      setMobileDetailOpen(true)
    }
  }

  return (
    <>
      <div className="space-y-5">
        {snapshotQuery.error ? (
          <section className="rounded-[24px] border border-amber-300/20 bg-amber-300/10 px-5 py-4 text-sm text-amber-100">
            Live command-center data is reconnecting. The control surface shell stays resolved so
            operators can orient immediately while decision, proof, and replay data reattach.
          </section>
        ) : null}

        <GlobalCommandHeader snapshot={snapshot} selectedTrace={selectedTrace} selectedReplay={selectedReplay} />

        <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1.25fr)_420px]">
          <div className="space-y-5">
            <SaiqGovernanceEngine governance={governance} />
            <SystemHealthPanel providers={snapshot.health.providers} snapshot={snapshot.health} />
          </div>

          <div className="space-y-5">
            <WorldExecutionGrid model={worldModel} selectedFrameId={selectedFrameId} onSelectFrame={handleSelectDecision} />
            <RecentDecisionQueue
              items={snapshot.decisionCore.recentDecisions}
              selectedFrameId={selectedFrameId}
              onSelect={handleSelectDecision}
            />
            <div className="xl:hidden">
              <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(4,10,24,0.96),rgba(3,9,20,0.92))] p-5">
                <div className="flex items-center gap-3">
                  <GitBranch className="h-5 w-5 text-cyan-300" />
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Selected frame status</div>
                    <div className="mt-1 text-lg font-semibold text-white">Open a decision to inspect proof, trace, and replay.</div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.18em] text-slate-300">
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1">
                    {selectedDecision?.decisionFrameId ?? 'No frame selected'}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1">
                    {selectedReplay ? (selectedReplay.deterministicMatch ? 'Replay verified' : 'Replay mismatch') : 'Replay on open'}
                  </span>
                </div>
              </section>
            </div>
          </div>

          <div className="hidden xl:block">
            <div className="sticky top-6">
              <DecisionDetailPanel
                selectedDecision={selectedDecision}
                selectedTrace={selectedTrace}
                selectedReplay={selectedReplay}
                governance={governance}
                proofHash={activeProofHash}
                providerRefs={activeProviderRefs}
                evidenceRefs={activeEvidenceRefs}
              />
            </div>
          </div>
        </div>
      </div>

      <DecisionDetailSheet
        open={mobileDetailOpen}
        title={selectedDecision ? `${resolveActionMeta(selectedDecision.action).label} detail` : 'Decision detail'}
        onClose={() => setMobileDetailOpen(false)}
      >
        <DecisionDetailPanel
          selectedDecision={selectedDecision}
          selectedTrace={selectedTrace}
          selectedReplay={selectedReplay}
          governance={governance}
          proofHash={activeProofHash}
          providerRefs={activeProviderRefs}
          evidenceRefs={activeEvidenceRefs}
          mobile
        />
      </DecisionDetailSheet>
    </>
  )
}
