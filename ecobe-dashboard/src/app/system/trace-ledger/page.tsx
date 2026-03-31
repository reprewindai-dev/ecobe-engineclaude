import type { Metadata } from 'next'

import { TraceLedgerPanel } from '@/components/landing/TraceLedgerPanel'
import { InformationPageShell } from '@/components/site/InformationPageShell'
import { getLiveSystemSnapshot } from '@/lib/control-surface/live-system'
import { createPageMetadata } from '@/lib/seo'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createPageMetadata({
  title: 'Trace Ledger',
  description:
    'The append-only trace ledger stores decision lineage so proof and replay reference the same deterministic frame.',
  path: '/system/trace-ledger',
  keywords: ['trace ledger', 'append-only lineage', 'deterministic frame'],
})

export default async function SystemTraceLedgerPage() {
  const snapshot = await getLiveSystemSnapshot()

  return (
    <InformationPageShell
      eyebrow="System / Trace Ledger"
      title="Append-only decision trace, not a derived afterthought."
      summary="The trace ledger stores the curated execution trace for a decision frame so replay and proof can reference the same deterministic inputs instead of rebuilding history from live provider state."
      secondaryHref="/system/replay"
      secondaryLabel="View Replay"
    >
      <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <article className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Ledger contract</div>
          <div className="mt-4 space-y-4 text-sm leading-7 text-slate-300">
            <p>Each trace record is keyed to a decision frame and chained with sequence and hash values.</p>
            <p>Proof, governance source, selected region, and performance timing are all attached to the trace view.</p>
            <p>Trace availability is reported directly from the live route so proof and replay stay tied to the same stored frame.</p>
          </div>
        </article>
        <TraceLedgerPanel traceLedger={snapshot.traceLedger} />
      </section>
    </InformationPageShell>
  )
}
