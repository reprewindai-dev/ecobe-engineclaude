import type { Metadata } from 'next'

import { ProviderVerificationPanel } from '@/components/landing/ProviderVerificationPanel'
import { TraceLedgerPanel } from '@/components/landing/TraceLedgerPanel'
import { InformationPageShell } from '@/components/site/InformationPageShell'
import { getLiveSystemSnapshot } from '@/lib/control-surface/live-system'
import { createPageMetadata } from '@/lib/seo'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createPageMetadata({
  title: 'Assurance',
  description:
    'Proof and verification authority for binding compute decisions: verified water provenance, trace integrity, deterministic replay, and proof posture.',
  path: '/assurance',
  keywords: [
    'proof authority',
    'verified provenance',
    'deterministic replay',
    'decision proof',
  ],
})

export default async function AssurancePage() {
  const snapshot = await getLiveSystemSnapshot()
  const verifiedDatasets = snapshot.providers.datasets.filter(
    (dataset) => dataset.verificationStatus === 'verified'
  ).length
  const assuranceReady =
    snapshot.providers.available &&
    verifiedDatasets === snapshot.providers.datasets.length &&
    snapshot.traceLedger.proofAvailable

  return (
    <InformationPageShell
      eyebrow="Assurance"
      title="Proof authority for every binding execution decision."
      summary="Assurance is the verification surface. It owns proof depth, trace integrity, deterministic replay posture, and provenance verification so operators can validate why a decision was allowed, blocked, or rerouted."
      primaryHref="/console"
      primaryLabel="Open Control Surface"
      secondaryHref="/status"
      secondaryLabel="View Status"
    >
      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Verification Posture</div>
          <div className="mt-3 text-4xl font-black tracking-[-0.05em] text-white">
            {assuranceReady ? 'Yes' : 'No'}
          </div>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            Derived from live provenance verification plus trace-backed proof availability.
          </p>
        </article>
        <article className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Provenance Coverage</div>
          <div className="mt-3 text-4xl font-black tracking-[-0.05em] text-white">
            {verifiedDatasets}/{snapshot.providers.datasets.length}
          </div>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            Aqueduct, AWARE, WWF, and NREL are verified individually before they can support authority claims.
          </p>
        </article>
        <article className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Replay Authority</div>
          <div className="mt-3 text-4xl font-black tracking-[-0.05em] text-white">
            {snapshot.traceLedger.replayConsistent == null
              ? 'Pending'
              : snapshot.traceLedger.replayConsistent
                ? 'Verified'
                : 'Mismatch'}
          </div>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            Replay stays authoritative only when stored and recomputed outcomes remain consistent.
          </p>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <article className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Role</div>
          <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-white">
            Assurance proves decisions. Status scans operations.
          </h2>
          <p className="mt-4 text-sm leading-7 text-slate-300">
            Use Status for a fast operational read of latency, recency, and system posture. Use
            Assurance when you need trace depth, proof references, replay verification, and
            provenance framing that can stand behind a binding decision.
          </p>
        </article>
        <article className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Trust Frame</div>
          <div className="mt-4 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
            <div className="rounded-[20px] border border-white/8 bg-slate-950/40 p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Proof</div>
              <div className="mt-2 text-white">
                {snapshot.traceLedger.proofAvailable ? 'Attached on the current frame.' : 'Unavailable on the current frame.'}
              </div>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-slate-950/40 p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Trace</div>
              <div className="mt-2 text-white">
                {snapshot.traceLedger.traceAvailable ? 'Locked and inspectable.' : 'Not currently exposed.'}
              </div>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-slate-950/40 p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Replay</div>
              <div className="mt-2 text-white">
                {snapshot.traceLedger.replayConsistent == null
                  ? 'Available on inspect.'
                  : snapshot.traceLedger.replayConsistent
                    ? 'Deterministically consistent.'
                    : 'Replay mismatch detected.'}
              </div>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-slate-950/40 p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Provenance</div>
              <div className="mt-2 text-white">
                {verifiedDatasets} of {snapshot.providers.datasets.length} required water datasets verified.
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <ProviderVerificationPanel providers={snapshot.providers} />
        <TraceLedgerPanel traceLedger={snapshot.traceLedger} />
      </section>
    </InformationPageShell>
  )
}
