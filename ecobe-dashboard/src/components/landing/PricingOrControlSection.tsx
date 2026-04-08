'use client'

import Link from 'next/link'

export function PricingOrControlSection() {
  const plans = [
    {
      name: 'Operator',
      price: 'From $7,500',
      cadence: '/month',
      pitch: 'One production control point with canonical decision storage, operator proof, and a real enforcement wedge.',
      features: ['Decision API v1', 'One production enforcement path', 'Replay-ready evidence'],
      highlight: false,
    },
    {
      name: 'Governance',
      price: 'From $18,000',
      cadence: '/month',
      pitch: 'Multi-team governance with deeper runtime control, proof exports, and regulated workload posture.',
      features: ['Policy governance controls', 'Proof export and replay visibility', 'Kubernetes, queue, and webhook coverage'],
      highlight: true,
    },
    {
      name: 'Assurance',
      price: 'Custom',
      cadence: '',
      pitch: 'Assurance-driven deployment for enterprises that need governed evidence workflows and controlled trust boundaries.',
      features: ['Controlled assurance workflows', 'Signed chain delivery design', 'Architecture review for internal control teams'],
      highlight: false,
    },
  ]

  return (
    <section className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
      <div className="max-w-3xl">
        <div className="text-[11px] uppercase tracking-[0.28em] text-emerald-300">Start with control</div>
        <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl">
          Price the control plane like infrastructure.
        </h2>
        <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-base">
          CO2 Router is sold around decisioning, enforcement scope, proof, and governance depth.
          The commercial surface should read like execution authority, not a generic software seat plan.
        </p>
      </div>
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`rounded-[28px] border p-6 ${
              plan.highlight
                ? 'border-cyan-300/24 bg-cyan-300/8 shadow-[0_18px_80px_rgba(34,211,238,0.12)]'
                : 'border-white/8 bg-slate-950/55'
            }`}
          >
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
              {plan.name}
            </div>
            <div className="mt-4 text-4xl font-black tracking-[-0.05em] text-white">
              {plan.price}
              {plan.cadence && <span className="text-lg font-semibold text-slate-500">{plan.cadence}</span>}
            </div>
            <p className="mt-4 text-sm leading-7 text-slate-300">{plan.pitch}</p>
            <div className="mt-6 space-y-2 text-sm text-slate-200">
              {plan.features.map((feature) => (
                <div key={feature} className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-2">
                  {feature}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/console"
          className="rounded-2xl bg-gradient-to-r from-emerald-300 via-cyan-300 to-sky-400 px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-slate-950"
        >
          Open the Control Surface
        </Link>
        <Link
          href="/methodology"
          className="rounded-2xl border border-white/12 bg-white/[0.04] px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white"
        >
          View methodology
        </Link>
        <Link
          href="/contact"
          className="rounded-2xl border border-white/12 bg-white/[0.04] px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white"
        >
          Contact sales
        </Link>
      </div>
    </section>
  )
}
