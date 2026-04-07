import Link from 'next/link'

export default function AccessPage() {
  return (
    <div className="space-y-8 pb-10">
      <section className="surface-card-strong p-8">
        <div className="eyebrow">Access / Demo</div>
        <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">Request a pilot with real decision authority.</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
          The right pilot is one workload, one control point, one proof trail, and one buying reason.
          Public users see the HallOGrid live mirror. Pilot access unlocks the operator surface where
          trace, replay, doctrine, and governed controls actually live.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="surface-card p-6">
          <div className="eyebrow">Pro Eval</div>
          <p className="mt-4 text-base leading-7 text-slate-300">
            Decision API access, one enforced path, proof visibility, live replay, operator detail, and a guided
            HallOGrid review tied to your real workload shape.
          </p>
        </div>
        <div className="surface-card p-6">
          <div className="eyebrow">Pro Production</div>
          <p className="mt-4 text-base leading-7 text-slate-300">
            Production authority adds tenant-aware routing, role-gated controls, doctrine management,
            and rollout approval for real workload enforcement.
          </p>
        </div>
      </section>

      <section className="surface-card p-6">
        <div className="eyebrow">Entitlement path</div>
        <div className="mt-5 grid gap-4 md:grid-cols-4">
          {[
            ['public_preview', 'Anonymous live mirror with delayed, redacted governed records.'],
            ['pro_eval', 'Guided evaluation for one workload, one control point, one operator loop.'],
            ['pro_production', 'Tenant-aware operator surface with deployment approval.'],
            ['compliance_pack', 'Adds compliance cockpit and deeper governance evidence views.'],
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
