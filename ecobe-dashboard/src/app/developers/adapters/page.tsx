import type { Metadata } from 'next'

import { InformationPageShell } from '@/components/site/InformationPageShell'
import { createPageMetadata } from '@/lib/seo'

const adapters = [
  ['http', 'ecobe.http.decision.v1'],
  ['event', 'ecobe.cloudevents.adapter.v1'],
  ['queue', 'ecobe.queue.adapter.v1'],
  ['lambda', 'ecobe.lambda.adapter.v1'],
  ['kubernetes', 'ecobe.kubernetes.adapter.v1'],
  ['github_actions', 'ecobe.github-actions.adapter.v1'],
]

export const metadata: Metadata = createPageMetadata({
  title: 'Developers Adapters',
  description:
    'Execution adapters carry the same binding CO2 Router decision contract into different runtimes and control points.',
  path: '/developers/adapters',
  keywords: ['execution adapters', 'runtime adapters', 'binding decision contract'],
})

export default function DevelopersAdaptersPage() {
  return (
    <InformationPageShell
      eyebrow="Developers / Adapters"
      title="Thin execution adapters around one deterministic core."
      summary="CO2 Router does not fork logic per runtime. Adapters carry the same binding decision contract into different execution environments and record which control point produced the frame."
      secondaryHref="/developers/api"
      secondaryLabel="View API"
    >
      <section className="grid gap-4 md:grid-cols-2">
        {adapters.map(([runtime, adapterId]) => (
          <article key={adapterId} className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
            <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">{runtime}</div>
            <div className="mt-3 text-xl font-bold text-white">{adapterId}</div>
            <p className="mt-4 text-sm leading-7 text-slate-300">
              The adapter context is attached to the decision frame so proof, trace, and replay
              can explain which entry surface enforced the authorization result.
            </p>
          </article>
        ))}
      </section>
    </InformationPageShell>
  )
}
