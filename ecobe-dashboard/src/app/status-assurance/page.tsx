import { getControlPlaneSnapshot } from '@/lib/ecobe'

export const dynamic = 'force-dynamic'

export default async function StatusAssurancePage() {
  const snapshot = await getControlPlaneSnapshot()
  const latestDecision = snapshot.latestDecision

  return (
    <div className="space-y-8 pb-10">
      <section className="surface-card-strong p-8">
        <div className="eyebrow">Status / Assurance</div>
        <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">Operational truth for the live control plane.</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
          This page is intentionally honest about what is live, what is operational, and what is still not fully assurance-ready.
        </p>
      </section>

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <div className="surface-card p-6">
          <div className="eyebrow">System</div>
          <div className="mt-3 text-3xl font-semibold text-white">{snapshot.health?.status ?? 'unknown'}</div>
        </div>
        <div className="surface-card p-6">
          <div className="eyebrow">Assurance</div>
          <div className="mt-3 text-3xl font-semibold text-white">{snapshot.health?.assurance?.status ?? 'unknown'}</div>
        </div>
        <div className="surface-card p-6">
          <div className="eyebrow">Latest frame</div>
          <div className="mt-3 text-sm font-mono text-slate-200">{latestDecision?.decisionFrameId ?? 'n/a'}</div>
        </div>
        <div className="surface-card p-6">
          <div className="eyebrow">Proof hash</div>
          <div className="mt-3 break-all font-mono text-xs text-slate-200">{latestDecision?.proofHash ?? 'missing'}</div>
        </div>
      </section>

      <section className="surface-card p-6">
        <div className="eyebrow">Assurance detail</div>
        <div className="mt-4 space-y-3 text-base leading-7 text-slate-300">
          <p>Operationally usable: <span className="font-semibold text-white">{snapshot.health?.assurance?.operationallyUsable ? 'yes' : 'no'}</span></p>
          <p>Assurance-ready: <span className="font-semibold text-white">{snapshot.health?.assurance?.assuranceReady ? 'yes' : 'no'}</span></p>
          <p>Unhashed datasets: <span className="font-semibold text-white">{(snapshot.health?.assurance?.unhashedDatasets ?? []).join(', ') || 'none reported'}</span></p>
        </div>
      </section>
    </div>
  )
}
