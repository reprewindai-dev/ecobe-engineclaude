import type { Metadata } from 'next'

import { InformationPageShell } from '@/components/site/InformationPageShell'
import { createPageMetadata } from '@/lib/seo'

export const metadata: Metadata = createPageMetadata({
  title: 'About',
  description:
    'CO2 Router is building the execution authority layer for environmentally governed compute: binding decisions, proof, replay, and provenance before workloads run.',
  path: '/company/about',
  keywords: ['about CO2 Router', 'execution authority', 'environmentally governed compute'],
})

export default function CompanyAboutPage() {
  return (
    <InformationPageShell
      eyebrow="Company / About"
      title="CO2 Router is built as execution authority, not reporting software."
      summary="CO2 Router is building the execution authority layer for environmentally governed compute. The product decides whether workloads run, records proof against the same frame, and supports replay and provenance as part of the operating contract."
      secondaryHref="/methodology"
      secondaryLabel="View Methodology"
    >
      <section className="grid gap-4 lg:grid-cols-3">
        {[
          'Pre-execution authorization instead of post-hoc reporting.',
          'Proof, trace, and replay as part of the product contract.',
          'Water authority as a first-class decision constraint.',
        ].map((line) => (
          <article
            key={line}
            className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 text-sm leading-7 text-slate-300"
          >
            {line}
          </article>
        ))}
      </section>
    </InformationPageShell>
  )
}
