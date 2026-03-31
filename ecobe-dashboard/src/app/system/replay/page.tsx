import type { Metadata } from 'next'

import { InformationPageShell } from '@/components/site/InformationPageShell'
import { getLiveSystemSnapshot } from '@/lib/control-surface/live-system'
import { createPageMetadata } from '@/lib/seo'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createPageMetadata({
  title: 'Replay',
  description:
    'Deterministic replay proves that the same decision frame and stored inputs produce the same outcome.',
  path: '/system/replay',
  keywords: ['deterministic replay', 'decision replay', 'trace-backed replay'],
})

export default async function SystemReplayPage() {
  const snapshot = await getLiveSystemSnapshot()

  return (
    <InformationPageShell
      eyebrow="System / Replay"
      title="Replay must re-run the same frame, not a new one."
      summary="Replay is only meaningful when the same stored decision frame can be reconstructed against the same trace-backed inputs. This page reports the latest replay posture exactly as the engine returns it."
      secondaryHref="/system/trace-ledger"
      secondaryLabel="View Trace Ledger"
    >
      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Replay Consistency</div>
          <div className="mt-3 text-4xl font-black tracking-[-0.05em] text-white">
            {snapshot.traceLedger.replayConsistent == null
              ? 'n/a'
              : snapshot.traceLedger.replayConsistent
                ? 'Match'
                : 'Mismatch'}
          </div>
        </article>
        <article className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Trace Backing</div>
          <div className="mt-3 text-4xl font-black tracking-[-0.05em] text-white">
            {snapshot.traceLedger.traceAvailable ? 'Yes' : 'No'}
          </div>
        </article>
        <article className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Latest Reason</div>
          <div className="mt-3 text-base font-semibold text-white">
            {snapshot.governance.latestReasonCode ?? 'unavailable'}
          </div>
        </article>
      </section>
    </InformationPageShell>
  )
}
