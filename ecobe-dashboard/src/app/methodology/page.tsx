import type { Metadata } from 'next'
import Link from 'next/link'

import {
  existingApproachGroups,
  investorComparisonRows,
  methodologySources,
  proofArtifacts,
  routerActions,
} from '@/lib/positioning'
import { createPageMetadata } from '@/lib/seo'

export const metadata: Metadata = createPageMetadata({
  title: 'Methodology',
  description:
    'How CO2 Router differs from schedulers, carbon APIs, and audit systems through deterministic pre-execution governance, binding decisions, and replayable proof.',
  path: '/methodology',
  keywords: [
    'deterministic infrastructure control',
    'pre-execution governance',
    'binding decisions',
    'replayable proof',
  ],
})

export default function MethodologyPage() {
  return (
    <div className="space-y-8 pb-8">
      <section className="overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.12),transparent_35%),linear-gradient(180deg,rgba(5,10,20,0.96),rgba(2,8,18,0.98))] p-6 sm:p-8 lg:p-10">
        <div className="max-w-4xl">
          <div className="text-[11px] uppercase tracking-[0.28em] text-emerald-300">
            Methodology
          </div>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.05em] text-white sm:text-5xl lg:text-6xl">
            CO2 Router is not a scheduler.
            <span className="block bg-gradient-to-r from-emerald-300 via-cyan-300 to-sky-400 bg-clip-text text-transparent">
              It is a control plane.
            </span>
          </h1>
          <p className="mt-5 max-w-3xl text-sm leading-8 text-slate-300 sm:text-base">
            Modern infrastructure is no longer optimized. It is governed. Most existing systems
            operate as schedulers or advisors. They suggest better placements or defer workloads
            based on forecasts. CO2 Router introduces a different model: a deterministic compute
            control plane that enforces execution decisions before workloads run, with SAIQ
            governance and replayable proof attached to the same frame.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/console"
              className="rounded-2xl bg-gradient-to-r from-emerald-300 via-cyan-300 to-sky-400 px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-slate-950"
            >
              Open Control Surface
            </Link>
            <Link
              href="/"
              className="rounded-2xl border border-white/12 bg-white/[0.04] px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white"
            >
              Back to Overview
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
        <div className="max-w-3xl">
          <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-300">
            Category overview
          </div>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl">
            Advisory systems optimize.
            <span className="block text-slate-200">CO2 Router enforces.</span>
          </h2>
          <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-base">
            The architectural difference is decision authority. Most products in this category are
            informational or advisory layers. They expose telemetry, recommend a cleaner region, or
            tune scheduling heuristics. CO2 Router sits in front of execution targets and returns a
            binding action before compute is admitted.
          </p>
        </div>

        <div className="mt-8 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                <th className="px-3 py-2">System Type</th>
                <th className="px-3 py-2">Decision Authority</th>
                <th className="px-3 py-2">Proof</th>
                <th className="px-3 py-2">Multi-Objective</th>
                <th className="px-3 py-2">Real-Time Enforcement</th>
              </tr>
            </thead>
            <tbody>
              {investorComparisonRows.map((row) => {
                const highlight = row.systemType === 'CO2 Router'
                return (
                  <tr
                    key={row.systemType}
                    className={
                      highlight
                        ? 'rounded-2xl border border-cyan-300/18 bg-cyan-300/8 text-white'
                        : 'rounded-2xl border border-white/8 bg-white/[0.03] text-slate-300'
                    }
                  >
                    <td className="rounded-l-2xl px-3 py-4 font-semibold">{row.systemType}</td>
                    <td className="px-3 py-4">{row.decisionAuthority}</td>
                    <td className="px-3 py-4">{row.proof}</td>
                    <td className="px-3 py-4">{row.multiObjective}</td>
                    <td className="rounded-r-2xl px-3 py-4">{row.realTimeEnforcement}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
        <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-300">Existing approaches</div>
        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          {existingApproachGroups.map((group) => (
            <div
              key={group.title}
              className="rounded-[28px] border border-white/8 bg-slate-950/60 p-6"
            >
              <h3 className="text-2xl font-bold text-white">{group.title}</h3>
              <p className="mt-4 text-sm leading-7 text-slate-300">{group.description}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {group.examples.map((example) => (
                  <span
                    key={example}
                    className="rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-slate-300"
                  >
                    {example}
                  </span>
                ))}
              </div>
              <div className="mt-6 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                Limitations
              </div>
              <div className="mt-3 space-y-3 text-sm text-slate-300">
                {group.limitations.map((limitation) => (
                  <div key={limitation}>{limitation}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <div className="text-[11px] uppercase tracking-[0.28em] text-emerald-300">
            What CO2 Router does differently
          </div>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl">
            One decision engine. Five binding outcomes.
          </h2>
          <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-base">
            CO2 Router unifies real-time signal evaluation, deterministic decisioning, enforcement
            at execution time, replayable audit proof, and multi-objective tradeoffs across carbon,
            water, latency, and cost. Every workload is evaluated before execution and results in
            one binding action.
          </p>
          <div className="mt-6 space-y-3">
            {routerActions.map((action) => (
              <div
                key={action.name}
                className="rounded-[24px] border border-white/8 bg-slate-950/60 p-4"
              >
                <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">
                  {action.name}
                </div>
                <div className="mt-2 text-sm leading-7 text-slate-300">{action.description}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[32px] border border-cyan-300/14 bg-[radial-gradient(circle_at_top,rgba(45,212,191,0.12),transparent_42%),rgba(2,8,23,0.84)] p-6 sm:p-8">
          <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-300">Proof + audit</div>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl">
            Audit-grade verification instead of estimated reporting.
          </h2>
          <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-base">
            Every decision produces the evidence required to explain, replay, and verify what
            happened. This is the difference between a sustainability narrative and a defensible
            control surface.
          </p>
          <div className="mt-6 space-y-3">
            {proofArtifacts.map((artifact) => (
              <div
                key={artifact.name}
                className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4"
              >
                <div className="text-sm font-semibold text-white">{artifact.name}</div>
                <div className="mt-2 text-sm leading-7 text-slate-300">{artifact.description}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 text-center sm:p-8">
        <div className="text-[11px] uppercase tracking-[0.28em] text-emerald-300">
          Positioning line
        </div>
        <div className="mt-4 text-3xl font-black tracking-[-0.04em] text-white sm:text-5xl">
          CO2 Router is not a scheduler.
        </div>
        <div className="mt-2 text-2xl font-bold text-slate-200 sm:text-4xl">It is a control plane.</div>
        <div className="mt-4 text-base font-semibold uppercase tracking-[0.18em] text-cyan-300 sm:text-lg">
          It does not recommend. It enforces.
        </div>
      </section>

      <section className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
        <div className="max-w-3xl">
          <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-300">Source base</div>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl">
            Primary references behind the category argument
          </h2>
          <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-base">
            This methodology is grounded in control-plane architecture, marginal emissions logic,
            water risk datasets, hash-chain audit patterns, and carbon-aware scheduling literature.
          </p>
        </div>
        <div className="mt-6 grid gap-3">
          {methodologySources.map((source) => (
            <a
              key={source.href}
              href={source.href}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-[24px] border border-white/8 bg-slate-950/60 px-4 py-4 text-sm text-slate-200 transition hover:border-cyan-300/30 hover:text-white"
            >
              {source.label}
            </a>
          ))}
        </div>
      </section>
    </div>
  )
}
