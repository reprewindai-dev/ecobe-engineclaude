'use client'

import Link from 'next/link'

import { investorComparisonRows } from '@/lib/positioning'

export function CategoryDifferenceSection() {
  return (
    <section className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
      <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr]">
        <div>
          <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-300">
            Why CO2 Router is Different
          </div>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl">
            Every system below tries to optimize infrastructure.
            <span className="block bg-gradient-to-r from-emerald-300 via-cyan-300 to-sky-400 bg-clip-text text-transparent">
              CO2 Router controls it.
            </span>
          </h2>
          <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-base">
            Most systems suggest where workloads could run, rely on forecasts or static policies,
            operate after the fact, and cannot prove what actually happened. CO2 Router decides
            before execution, enforces one of five actions, co-optimizes carbon, water, cost, and
            latency, and produces replayable tamper-evident proof.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-[24px] border border-white/8 bg-slate-950/60 p-5">
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                Most approaches
              </div>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <div>Suggest where workloads could run</div>
                <div>Rely on forecasts or static policies</div>
                <div>Operate after the fact</div>
                <div>Cannot prove what actually happened</div>
              </div>
            </div>
            <div className="rounded-[24px] border border-cyan-300/16 bg-cyan-300/8 p-5">
              <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-100">
                CO2 Router
              </div>
              <div className="mt-4 space-y-3 text-sm text-slate-50">
                <div>Decides before execution</div>
                <div>Enforces one of five binding actions</div>
                <div>Co-optimizes carbon, water, cost, and latency</div>
                <div>Produces replayable tamper-evident proof</div>
              </div>
            </div>
          </div>

          <div className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-emerald-300">
            This is not scheduling. This is infrastructure control.
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-slate-950/68 p-5 shadow-[0_18px_90px_rgba(0,0,0,0.32)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.28em] text-emerald-300">
                Category dominance
              </div>
              <h3 className="mt-2 text-2xl font-bold text-white">Investor comparison block</h3>
            </div>
          <Link
            href="#proof"
            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-200 transition hover:border-cyan-300/40 hover:text-cyan-200"
          >
            Full methodology
          </Link>
          </div>

          <div className="mt-5 overflow-x-auto">
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
        </div>
      </div>
    </section>
  )
}
