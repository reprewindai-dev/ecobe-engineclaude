'use client'

import Link from 'next/link'

export function PricingOrControlSection() {
  const plans = [
    {
      name: 'CI',
      price: '$99',
      cadence: '/month',
      pitch: 'Start with preflight decisions and proof in the pipeline.',
      features: ['GitHub Actions wedge', 'Five binding actions', 'Replay-ready evidence'],
      highlight: false,
    },
    {
      name: 'Control Surface',
      price: '$499',
      cadence: '/month',
      pitch: 'Add live control visibility, MSS posture, and investor-grade proof surfaces.',
      features: ['Control Surface', 'Proof panels', 'Signal doctrine visibility'],
      highlight: true,
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      cadence: '',
      pitch: 'Full control-plane rollout with policy adapters and workload enforcement.',
      features: ['Kubernetes wedge', 'Signed events', 'Integration support'],
      highlight: false,
    },
  ]

  return (
    <section className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
      <div className="max-w-3xl">
        <div className="text-[11px] uppercase tracking-[0.28em] text-emerald-300">Start with control</div>
        <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl">
          Expand from CI wedge to execution authority.
        </h2>
        <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-base">
          The first sale is not a dashboard. It is an enforcement path. The public surface should
          make that obvious.
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
