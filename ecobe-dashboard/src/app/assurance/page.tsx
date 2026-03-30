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
    'Assurance for binding compute decisions: verified water provenance, proof availability, trace integrity, and deterministic replay posture.',
  path: '/assurance',
  keywords: [
    'environmental assurance',
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
      title="Proof, trace, replay, and provenance behind every binding decision."
      summary="CO2 Router treats assurance as an execution requirement, not a reporting add-on. The authority layer verifies water datasets, attaches proof references to decision frames, and preserves the trace required for deterministic replay."
      secondaryHref="/system/provenance"
      secondaryLabel="View Provenance"
    >
      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Assurance Ready</div>
          <div className="mt-3 text-4xl font-black tracking-[-0.05em] text-white">
            {assuranceReady ? 'Yes' : 'No'}
          </div>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            Derived from live provenance verification plus proof availability.
          </p>
        </article>
        <article className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Verified Datasets</div>
          <div className="mt-3 text-4xl font-black tracking-[-0.05em] text-white">
            {verifiedDatasets}/{snapshot.providers.datasets.length}
          </div>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            Aqueduct, AWARE, WWF, and NREL are tracked individually.
          </p>
        </article>
        <article className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Proof Posture</div>
          <div className="mt-3 text-4xl font-black tracking-[-0.05em] text-white">
            {snapshot.traceLedger.proofAvailable ? 'Live' : 'Unavailable'}
          </div>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            Proof is attached only when the live decision frame exposes it.
          </p>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <ProviderVerificationPanel providers={snapshot.providers} />
        <TraceLedgerPanel traceLedger={snapshot.traceLedger} />
      </section>
    </InformationPageShell>
  )
}
