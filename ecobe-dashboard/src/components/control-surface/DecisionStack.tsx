'use client'

import type { ControlSurfaceDecisionSummary } from '@/types/control-surface'
import { DecisionCard } from './DecisionCard'

export function DecisionStack({
  decisions,
  selectedDecisionFrameId,
  explainSimply,
  onSelect,
}: {
  decisions: ControlSurfaceDecisionSummary[]
  selectedDecisionFrameId: string | null
  explainSimply: boolean
  onSelect: (decisionFrameId: string) => void
}) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">Decision stack</div>
          <h3 className="mt-2 text-xl font-bold text-white">Recent enforced outcomes</h3>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        {decisions.map((decision) => (
          <DecisionCard
            key={decision.decisionFrameId}
            decision={decision}
            selected={decision.decisionFrameId === selectedDecisionFrameId}
            explainSimply={explainSimply}
            onSelect={() => onSelect(decision.decisionFrameId)}
          />
        ))}
      </div>
    </section>
  )
}
