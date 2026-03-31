import type { Metadata } from 'next'

import { InformationPageShell } from '@/components/site/InformationPageShell'
import { routerActions } from '@/lib/positioning'
import { createPageMetadata } from '@/lib/seo'

const evaluationOrder = [
  'Policy and governance constraints are applied before execution.',
  'Water authority can block, delay, or reroute execution.',
  'Latency and workload criticality keep the decision inside a defensible operating envelope.',
  'Carbon and cost refine placement once hard constraints are satisfied.',
]

export const metadata: Metadata = createPageMetadata({
  title: 'Decision Engine',
  description:
    'The CO2 Router decision engine authorizes compute before execution and returns one binding action with proof and trace state attached.',
  path: '/system/decision-engine',
  keywords: ['decision engine', 'authorize compute', 'binding action'],
})

export default function SystemDecisionEnginePage() {
  return (
    <InformationPageShell
      eyebrow="System / Decision Engine"
      title="Decisions happen before compute is admitted."
      summary="CO2 Router is an authorization system. The engine returns a binding action before execution, then records proof and trace state against the resulting frame."
      secondaryHref="/console"
      secondaryLabel="Open Control Surface"
    >
      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <article className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Evaluation order</div>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            {evaluationOrder.map((item) => (
              <div key={item} className="rounded-2xl border border-white/8 bg-slate-950/60 px-4 py-3">
                {item}
              </div>
            ))}
          </div>
        </article>
        <article className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Binding actions</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {routerActions.map((action) => (
              <div key={action.name} className="rounded-2xl border border-white/8 bg-slate-950/60 p-4">
                <div className="text-sm font-semibold uppercase tracking-[0.16em] text-white">
                  {action.name.replace(/_/g, ' ')}
                </div>
                <div className="mt-2 text-sm leading-7 text-slate-300">{action.description}</div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </InformationPageShell>
  )
}
