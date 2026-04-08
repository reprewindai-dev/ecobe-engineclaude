import Link from 'next/link'

export default function AccessPage() {
  return (
    <div className="space-y-8 pb-10">
      <section className="surface-card-strong p-8">
        <div className="eyebrow">Design Partner Access</div>
        <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">Request a design-partner lane with real decision authority.</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
          The right design-partner start is one workload, one control point, one proof trail, and one
          buying reason. Public users see the HallOGrid live mirror. Design-partner access unlocks the
          operator surface where trace, replay, doctrine, and governed controls actually live.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="surface-card p-6">
          <div className="eyebrow">What partners get</div>
          <p className="mt-4 text-base leading-7 text-slate-300">
            One real workflow, one enforced path, proof visibility, live replay, operator detail, and a
            guided HallOGrid review tied to your real workload shape.
          </p>
        </div>
        <div className="surface-card p-6">
          <div className="eyebrow">Who should reach out</div>
          <p className="mt-4 text-base leading-7 text-slate-300">
            Platform engineering, infrastructure governance, CI owners, Kubernetes teams, and regulated
            buyers that need pre-execution evidence and a practical paid continuation path.
          </p>
        </div>
      </section>

      <section className="surface-card p-6">
        <div className="eyebrow">Program shape</div>
        <div className="mt-5 grid gap-4 md:grid-cols-4">
          {[
            ['3-month pilot', 'A narrow, high-signal pilot with one real workflow and one real buying reason.'],
            ['white-glove onboarding', 'Hands-on integration into one control point with operator review and proof visibility.'],
            ['biweekly feedback', 'A short feedback loop focused on doctrine, proof, and operational fit.'],
            ['paid continuation path', 'Commercial packaging is explicit from day one if the workflow proves itself.'],
          ].map(([title, description]) => (
            <div key={title} className="rounded-3xl border border-white/10 bg-black/20 p-4">
              <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-cyan-300">{title}</div>
              <div className="mt-3 text-sm leading-7 text-slate-300">{description}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="surface-card p-6">
        <div className="eyebrow">Commercial path</div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/contact" className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200">
            Contact the team
          </Link>
          <Link href="/purchase" className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-5 py-3 text-sm font-semibold text-cyan-200 transition hover:border-cyan-300/30 hover:bg-cyan-300/15 hover:text-white">
            Compare Preview vs Pro
          </Link>
          <Link href="/pricing" className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/5">
            Review pricing
          </Link>
        </div>
      </section>
    </div>
  )
}
