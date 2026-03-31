import type { Metadata } from 'next'

import { DecisionFlowDiagram } from '@/components/DecisionFlowDiagram'
import { InformationPageShell } from '@/components/site/InformationPageShell'
import { createPageMetadata } from '@/lib/seo'

export const metadata: Metadata = createPageMetadata({
  title: 'Developers Architecture',
  description:
    'The public architecture of CO2 Router: signals, SAIQ governance, policy, decision, proof, trace, and deterministic replay.',
  path: '/developers/architecture',
  keywords: ['decision architecture', 'signals SAIQ policy proof', 'control plane architecture'],
})

export default function DevelopersArchitecturePage() {
  return (
    <InformationPageShell
      eyebrow="Developers / Architecture"
      title="One deterministic chain from signals to proof."
      summary="The public architecture is intentionally direct: signals are normalized, SAIQ and policy shape the decision, the engine returns one binding action, and proof stays attached to the resulting frame."
      secondaryHref="/system/decision-engine"
      secondaryLabel="View Decision Engine"
    >
      <section className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
        <DecisionFlowDiagram />
      </section>
    </InformationPageShell>
  )
}
