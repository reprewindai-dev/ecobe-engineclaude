import type { Metadata } from 'next'

import { ProviderVerificationPanel } from '@/components/landing/ProviderVerificationPanel'
import { InformationPageShell } from '@/components/site/InformationPageShell'
import { getLiveSystemSnapshot } from '@/lib/control-surface/live-system'
import { createPageMetadata } from '@/lib/seo'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createPageMetadata({
  title: 'Provenance',
  description:
    'Verified water provenance behind CO2 Router decisions, including Aqueduct, AWARE, WWF, and NREL dataset posture.',
  path: '/system/provenance',
  keywords: ['water provenance', 'verified datasets', 'Aqueduct AWARE WWF NREL'],
})

export default async function SystemProvenancePage() {
  const snapshot = await getLiveSystemSnapshot()

  return (
    <InformationPageShell
      eyebrow="System / Provenance"
      title="Verified water datasets behind the authority layer."
      summary="This page reports the live provenance route for the water datasets behind CO2 Router decisions: Aqueduct, AWARE, WWF, and NREL. Those inputs are visible because they are part of the authority layer, not because they are useful marketing artifacts."
      secondaryHref="/assurance"
      secondaryLabel="View Assurance"
    >
      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Provenance rule</div>
          <div className="mt-4 space-y-4 text-sm leading-7 text-slate-300">
            <p>Each dataset shown here is exposed through the live provenance route that backs the control plane.</p>
            <p>Each row records verification status plus manifest and computed hashes when available.</p>
          </div>
        </article>
        <ProviderVerificationPanel providers={snapshot.providers} />
      </section>
    </InformationPageShell>
  )
}
