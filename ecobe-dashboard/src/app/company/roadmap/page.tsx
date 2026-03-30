import type { Metadata } from 'next'

import { InformationPageShell } from '@/components/site/InformationPageShell'
import { createPageMetadata } from '@/lib/seo'

const workstreams = [
  {
    title: 'Authority path hardening',
    detail: 'Keep the decision path inside budget while preserving proof, replay, governance, and water authority.',
  },
  {
    title: 'Proof surface expansion',
    detail: 'Expand trace-backed inspection across live decision frames and make replay and provenance more explicit on the control surface.',
  },
  {
    title: 'Adapter and developer maturity',
    detail: 'Keep the canonical decision core stable while raising the maturity of the runtime adapter plane and developer integration surface.',
  },
]

export const metadata: Metadata = createPageMetadata({
  title: 'Roadmap',
  description:
    'Current execution tracks for CO2 Router: authority-path hardening, proof-surface expansion, and adapter maturity.',
  path: '/company/roadmap',
  keywords: ['CO2 Router roadmap', 'authority path hardening', 'proof surface expansion'],
})

export default function CompanyRoadmapPage() {
  return (
    <InformationPageShell
      eyebrow="Company / Roadmap"
      title="Active execution tracks."
      summary="This page names the engineering tracks that are active now. It stays focused on work already underway rather than speculative platform promises."
      secondaryHref="/status"
      secondaryLabel="View Status"
    >
      <section className="grid gap-4 md:grid-cols-3">
        {workstreams.map((item) => (
          <article key={item.title} className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
            <h2 className="text-xl font-bold text-white">{item.title}</h2>
            <p className="mt-4 text-sm leading-7 text-slate-300">{item.detail}</p>
          </article>
        ))}
      </section>
    </InformationPageShell>
  )
}
