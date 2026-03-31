import type { Metadata } from 'next'

import { InformationPageShell } from '@/components/site/InformationPageShell'
import { createPageMetadata } from '@/lib/seo'

export const metadata: Metadata = createPageMetadata({
  title: 'Developers SDKs',
  description:
    'Current developer integration posture for CO2 Router: the API contract, adapter plane, and enforcement bundles are the real supported surface.',
  path: '/developers/sdks',
  keywords: ['developer integrations', 'HTTP contract', 'adapter plane'],
})

export default function DevelopersSdksPage() {
  return (
    <InformationPageShell
      eyebrow="Developers / SDKs"
      title="The integration contract matters more than a packaging label."
      summary="The supported developer surface today is the canonical HTTP contract, the adapter plane, and the enforcement bundles emitted by the engine. That is the real integration surface the control plane stands behind."
      secondaryHref="/developers/adapters"
      secondaryLabel="View Adapters"
    >
      <section className="grid gap-4 lg:grid-cols-3">
        {[
          {
            title: 'What is real',
            body: 'The HTTP decision contract, replay routes, provenance inspection, and runtime adapters already exist and are the supported integration surface today.',
          },
          {
            title: 'What is not claimed',
            body: 'A separate package line is not the authority layer. The product contract today is the decision API, the adapter surface, and the proof-linked outputs the engine already emits.',
          },
          {
            title: 'How to integrate now',
            body: 'Call the authorization endpoint directly, use the adapter IDs where applicable, and consume proof, replay, and provenance records from the control plane.',
          },
        ].map((card) => (
          <article key={card.title} className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
            <h2 className="text-xl font-bold text-white">{card.title}</h2>
            <p className="mt-4 text-sm leading-7 text-slate-300">{card.body}</p>
          </article>
        ))}
      </section>
    </InformationPageShell>
  )
}
