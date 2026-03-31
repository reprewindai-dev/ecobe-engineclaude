import Link from 'next/link'

export default function AccessPage() {
  return (
    <div className="space-y-8 pb-10">
      <section className="surface-card-strong p-8">
        <div className="eyebrow">Access / Demo</div>
        <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">Request a pilot with real decision authority.</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
          The right pilot is one workload, one control point, one proof trail, and one buying reason. Start there and let the product prove itself quickly.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="surface-card p-6">
          <div className="eyebrow">What you get</div>
          <p className="mt-4 text-base leading-7 text-slate-300">
            Decision API access, one enforced path, proof visibility, and a live control-surface review tied to your real workload shape.
          </p>
        </div>
        <div className="surface-card p-6">
          <div className="eyebrow">Who should reach out</div>
          <p className="mt-4 text-base leading-7 text-slate-300">
            Platform engineering, infrastructure governance, CI owners, Kubernetes teams, and regulated buyers that need pre-execution evidence.
          </p>
        </div>
      </section>

      <section className="surface-card p-6">
        <div className="eyebrow">Commercial path</div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/contact" className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200">
            Contact the team
          </Link>
          <Link href="/pricing" className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/5">
            Review pricing
          </Link>
        </div>
      </section>
    </div>
  )
}
