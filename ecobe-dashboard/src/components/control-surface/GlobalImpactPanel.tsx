'use client'

import { latencyToneClass } from '@/lib/control-surface/labels'
import { ActionDistributionMiniChart } from './ActionDistributionMiniChart'
import type { ActionDistributionItem, ControlSurfaceOverview } from '@/types/control-surface'

export function GlobalImpactPanel({
  impact,
  distribution,
  metrics,
}: {
  impact: ControlSurfaceOverview['impact']
  distribution: ActionDistributionItem[]
  metrics: ControlSurfaceOverview['metrics']
}) {
  const cards: Array<{ label: string; value: string; tone?: string }> = [
    { label: 'Decisions enforced', value: impact.totalDecisions.toLocaleString() },
    { label: 'Carbon avoided', value: `${impact.carbonAvoidedKg.toFixed(2)} kg` },
    { label: 'Water shifted', value: `${impact.waterShiftedLiters.toFixed(2)} L` },
    { label: 'Cost optimized', value: `$${impact.costOptimizedUsd.toFixed(2)}` },
    {
      label: 'High-confidence',
      value: `${impact.totalDecisions > 0 ? metrics.highConfidenceDecisionPct.toFixed(1) : '0.0'}%`,
    },
    { label: 'Fallback rate', value: `${(metrics.fallbackRate * 100).toFixed(1)}%` },
    {
      label: 'Current warm path',
      value: `${metrics.currentTotalMs.toFixed(0)} ms`,
      tone: latencyToneClass(metrics.currentTotalMs),
    },
    {
      label: 'Rolling p95',
      value: `${metrics.p95TotalMs.toFixed(0)} ms`,
      tone: latencyToneClass(metrics.p95TotalMs),
    },
    {
      label: 'Rolling p99',
      value: `${metrics.p99TotalMs.toFixed(0)} ms`,
      tone: latencyToneClass(metrics.p99TotalMs),
    },
  ]

  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
      <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">Global impact</div>
      <h3 className="mt-2 text-xl font-bold text-white">Execution impact at a glance</h3>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{card.label}</div>
            <div className={`mt-2 text-2xl font-bold tracking-[-0.04em] ${card.tone ?? 'text-white'}`}>
              {card.value}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6">
        <ActionDistributionMiniChart distribution={distribution} />
      </div>
    </section>
  )
}
