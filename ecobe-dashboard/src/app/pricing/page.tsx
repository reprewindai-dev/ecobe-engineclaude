import Link from 'next/link'

const tiers = [
  {
    name: 'Operator',
    price: 'From $7,500/mo',
    entry: 'One live control point for a single team.',
    description: 'For teams that need a real enforcement wedge in front of compute, with canonical decision storage, replay visibility, and operator-grade proof.',
    scale: 'Best for teams running up to 250k decisions per month.',
    highlights: [
      'Decision API v1 and control-surface access',
      'One production enforcement path',
      'Canonical decision storage and replay references',
      'Operator visibility into live decision posture',
    ],
  },
  {
    name: 'Governance',
    price: 'From $18,000/mo',
    entry: 'Multi-team governance with production enforcement depth.',
    description: 'For organizations standardizing policy, proof, and runtime control across multiple workloads, regions, and entry points.',
    scale: 'Built for high-volume decisioning, additional adapters, and regulated operating environments.',
    highlights: [
      'Multi-team policy governance and approval controls',
      'Enhanced proof export and replay visibility',
      'Kubernetes, queue, and webhook adapter coverage',
      'Operational support for regulated workload posture',
    ],
  },
  {
    name: 'Assurance',
    price: 'Custom',
    entry: 'Assurance-driven deployment for enterprise control programs.',
    description: 'For enterprises that need governed evidence workflows, signed export chains, and controlled operational trust boundaries.',
    scale: 'Scoped to assurance requirements, governance depth, and controlled rollout design.',
    highlights: [
      'Controlled assurance and proof export workflows',
      'Signed chain delivery and replay routing design',
      'Dedicated architecture review for internal control teams',
      'Commercial packaging aligned to governance scope',
    ],
  },
]

export default function PricingPage() {
  return (
    <div className="space-y-8 pb-10">
      <section className="surface-card-strong p-8">
        <div className="eyebrow">Pricing</div>
        <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">Charge for control, enforcement, and proof.</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
          CO2 Router is sold as execution approval infrastructure. The commercial surface is tied to decisioning, enforcement, proof, and governance depth, not to a generic sustainability dashboard seat count.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        {tiers.map((tier) => (
          <div key={tier.name} className="surface-card flex h-full flex-col p-6">
            <div className="eyebrow">{tier.name}</div>
            <div className="mt-4 text-3xl font-semibold text-white">{tier.price}</div>
            <div className="mt-4 text-sm font-semibold leading-6 text-slate-100">{tier.entry}</div>
            <p className="mt-3 text-sm leading-7 text-slate-300">{tier.description}</p>
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-7 text-slate-300">{tier.scale}</div>
            <div className="mt-5 space-y-3">
              {tier.highlights.map((highlight) => (
                <div key={highlight} className="flex items-start gap-3 text-sm leading-7 text-slate-300">
                  <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[rgba(109,225,255,0.95)]" />
                  <span>{highlight}</span>
                </div>
              ))}
            </div>
            <Link
              href="/access"
              className="mt-6 inline-flex rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
            >
              {tier.name === 'Assurance' ? 'Talk to sales' : 'Request access'}
            </Link>
          </div>
        ))}
      </section>

      <section className="surface-card p-8">
        <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <div className="eyebrow">Commercial model</div>
            <h2 className="mt-3 text-3xl font-semibold text-white">Package the control plane around decisions, enforcement scope, and governance depth.</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-black/20 p-5 text-sm leading-7 text-slate-300">
              <div className="text-base font-semibold text-white">Entry path</div>
              Start with one live decision loop, one control point, and one proof trail that your team can inspect under real production conditions.
            </div>
            <div className="rounded-3xl border border-white/10 bg-black/20 p-5 text-sm leading-7 text-slate-300">
              <div className="text-base font-semibold text-white">Scaling logic</div>
              Commercial expansion follows decision volume, enforcement coverage, adapter depth, and governance requirements rather than seats.
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
