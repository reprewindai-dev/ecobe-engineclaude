import type { Metadata } from 'next'

import { GovernancePanel } from '@/components/landing/GovernancePanel'
import { InformationPageShell } from '@/components/site/InformationPageShell'
import { getLiveSystemSnapshot } from '@/lib/control-surface/live-system'
import { createPageMetadata } from '@/lib/seo'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createPageMetadata({
  title: 'SAIQ Governance',
  description:
    'SAIQ is the governance layer that applies weighting, constraint logic, and policy posture to binding CO2 Router decisions.',
  path: '/system/saiq-governance',
  keywords: ['SAIQ governance', 'governance layer', 'policy weighting'],
})

export default async function SystemSaiqGovernancePage() {
  const snapshot = await getLiveSystemSnapshot()

  return (
    <InformationPageShell
      eyebrow="System / SAIQ Governance"
      title="SAIQ is the governance layer behind binding execution decisions."
      summary="SAIQ applies weighting, zone logic, and policy posture to the decision frame before execution. It does not replace the engine. It explains how governance shaped the binding outcome."
      secondaryHref="/system/trace-ledger"
      secondaryLabel="View Trace Ledger"
    >
      <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <article className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">What SAIQ means here</div>
          <div className="mt-4 space-y-4 text-sm leading-7 text-slate-300">
            <p>SAIQ is the governance state attached to the decision frame before execution is allowed.</p>
            <p>It records whether governance was active, which policy source shaped the frame, and how constraints affected the outcome.</p>
            <p>The control surface reports SAIQ only when the live trace exposes a non-NONE governance source.</p>
          </div>
        </article>
        <GovernancePanel governance={snapshot.governance} />
      </section>
    </InformationPageShell>
  )
}
