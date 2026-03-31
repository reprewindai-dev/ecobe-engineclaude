'use client'

import { motion } from 'framer-motion'

import { formatAction } from '@/components/control-surface/action-styles'
import { humanizeReasonCode, latencyToneClass } from '@/lib/control-surface/labels'
import type { CiRouteResponse, ControlSurfaceDecisionSummary } from '@/types/control-surface'

function isRouteResponse(decision: CiRouteResponse | ControlSurfaceDecisionSummary): decision is CiRouteResponse {
  return 'decision' in decision
}

function shortValue(value: string | null | undefined, length = 18) {
  if (!value) return 'Unavailable'
  return value.length <= length ? value : `${value.slice(0, length)}...`
}

export function DecisionExampleCard({
  decision,
  proofContext,
}: {
  decision: CiRouteResponse | ControlSurfaceDecisionSummary
  proofContext: {
    proofRef: string | null
    governance: string
    traceRef: string | null
    replay: string
    provenance: string
  }
}) {
  const action = formatAction(isRouteResponse(decision) ? decision.decision : decision.action)
  const routeDecision = isRouteResponse(decision) ? decision : null
  const summaryDecision = routeDecision ? null : (decision as ControlSurfaceDecisionSummary)

  const baselineRegion = routeDecision?.baseline.region ?? 'baseline region'
  const selectedRegion = routeDecision?.selected.region ?? summaryDecision?.selectedRegion ?? 'selected region'
  const baselineCarbon = routeDecision?.baseline.carbonIntensity ?? summaryDecision?.baselineCarbonIntensity ?? 0
  const selectedCarbon = routeDecision?.selected.carbonIntensity ?? summaryDecision?.carbonIntensity ?? 0
  const baselineWater = routeDecision?.baseline.waterImpactLiters ?? summaryDecision?.waterBaselineLiters ?? 0
  const selectedWater = routeDecision?.selected.waterImpactLiters ?? summaryDecision?.waterSelectedLiters ?? 0
  const totalLatency = routeDecision?.latencyMs?.total ?? summaryDecision?.latencyMs?.total ?? null
  const carbonReductionPct = routeDecision?.savings.carbonReductionPct ?? summaryDecision?.carbonReductionPct ?? 0
  const waterImpactDeltaLiters =
    routeDecision?.savings.waterImpactDeltaLiters ?? summaryDecision?.waterImpactDeltaLiters ?? 0
  const signalConfidence = routeDecision?.signalConfidence ?? summaryDecision?.signalConfidence ?? 0

  return (
    <motion.section
      id="live-decision"
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      className="grid gap-5 rounded-[32px] border border-white/10 bg-white/[0.035] p-6 backdrop-blur sm:p-8 lg:grid-cols-[1.1fr_1fr]"
    >
      <div>
        <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-300">Live decision example</div>
        <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl">
          Binding decision with proof attached
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
          This is not reporting after the fact. The control plane decides before execution,
          preserves the policy trace, and emits proof with the workload frame.
        </p>
      </div>
      <div className={`rounded-[28px] border bg-slate-950/70 p-5 ${action.border} ${action.glow}`}>
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-[0.25em] text-slate-500">decision card</span>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${action.badge}`}>
            {action.label}
          </span>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">baseline</div>
            <div className="mt-2 text-xl font-bold text-white">{baselineRegion}</div>
            <div className="mt-4 space-y-2 text-sm text-slate-300">
              <div>{baselineCarbon} gCO2/kWh</div>
              <div>{baselineWater.toFixed(2)} L estimated</div>
            </div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">selected</div>
            <div className="mt-2 text-xl font-bold text-white">{selectedRegion}</div>
            <div className="mt-4 space-y-2 text-sm text-slate-300">
              <div>{selectedCarbon} gCO2/kWh</div>
              <div>{selectedWater.toFixed(2)} L estimated</div>
            </div>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">carbon delta</div>
            <div className="mt-2 text-lg font-bold text-white">
              {carbonReductionPct.toFixed(1)}%
            </div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">water delta</div>
            <div className="mt-2 text-lg font-bold text-white">
              {waterImpactDeltaLiters.toFixed(2)} L
            </div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">confidence</div>
            <div className="mt-2 text-lg font-bold text-white">
              {(signalConfidence * 100).toFixed(0)}%
            </div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">latency</div>
            <div className={`mt-2 text-lg font-bold ${latencyToneClass(totalLatency)}`}>
              {totalLatency?.toFixed(0) ?? '--'} ms
            </div>
          </div>
        </div>
        <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">why</div>
          <div className="mt-2 text-sm text-slate-300">
            {routeDecision?.recommendation ?? summaryDecision?.summaryReason ?? 'Decision rationale available in proof.'}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(routeDecision?.policyTrace.reasonCodes ?? [decision.reasonCode]).slice(0, 4).map((reason) => (
              <span
                key={reason}
                className="rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[11px] text-slate-300"
              >
                {humanizeReasonCode(reason)}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">proof reference</div>
            <div className="mt-2 font-mono text-sm text-white">{shortValue(proofContext.proofRef)}</div>
            <div className="mt-2 text-xs text-slate-400">frame {shortValue(proofContext.traceRef, 14)}</div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">governance context</div>
            <div className="mt-2 text-sm font-semibold text-white">{proofContext.governance}</div>
            <div className="mt-2 text-xs text-slate-400">replay {proofContext.replay}</div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 sm:col-span-2">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">provenance posture</div>
            <div className="mt-2 text-sm text-white">{proofContext.provenance}</div>
          </div>
        </div>
      </div>
    </motion.section>
  )
}
