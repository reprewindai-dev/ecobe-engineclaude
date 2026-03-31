'use client'

import { formatDistanceToNowStrict } from 'date-fns'
import { motion } from 'framer-motion'

import { formatAction } from '@/components/control-surface/action-styles'
import { humanizeReasonCode, latencyToneClass } from '@/lib/control-surface/labels'
import type { ControlSurfaceDecisionSummary } from '@/types/control-surface'

export function DecisionCard({
  decision,
  selected,
  explainSimply,
  onSelect,
}: {
  decision: ControlSurfaceDecisionSummary
  selected: boolean
  explainSimply: boolean
  onSelect: () => void
}) {
  const action = formatAction(decision.action)

  return (
    <motion.button
      type="button"
      layout
      onClick={onSelect}
      className={`w-full rounded-[24px] border p-4 text-left transition ${
        selected
          ? `${action.border} bg-white/[0.06] ${action.glow}`
          : 'border-white/8 bg-white/[0.03] hover:border-cyan-300/20 hover:bg-white/[0.05]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">{decision.workloadLabel}</div>
          <div className="mt-1 text-xs text-slate-500">
            {formatDistanceToNowStrict(new Date(decision.createdAt), { addSuffix: true })}
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${action.badge}`}>
          {action.label}
        </span>
      </div>
      <div className="mt-4 grid gap-2 text-xs text-slate-300 sm:grid-cols-2">
        <div>Region: {decision.selectedRegion}</div>
        <div>Confidence: {(decision.signalConfidence * 100).toFixed(0)}%</div>
        <div>Carbon: {decision.carbonReductionPct.toFixed(1)}%</div>
        <div>Water: {decision.waterImpactDeltaLiters.toFixed(2)} L</div>
        <div className={latencyToneClass(decision.latencyMs?.total)}>
          Total latency: {decision.latencyMs?.total?.toFixed(0) ?? '--'} ms
        </div>
        <div>Signal mode: {decision.sourceMode}</div>
        <div>
          Latency decided: {decision.latencyMs?.withinEnvelope === false ? 'budget breach' : 'within envelope'}
        </div>
        <div>
          Cache path: {decision.latencyMs?.cacheStatus ?? 'live'}
        </div>
      </div>
      <div className="mt-4 text-sm text-slate-300">
        {explainSimply ? action.simple : decision.summaryReason}
      </div>
      <div className="mt-3 text-xs text-slate-500">
        {humanizeReasonCode(decision.reasonCode)}
      </div>
    </motion.button>
  )
}
