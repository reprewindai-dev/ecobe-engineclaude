'use client'

import Link from 'next/link'

export function FinalCTASection() {
  return (
    <section className="rounded-[32px] border border-cyan-300/18 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.18),transparent_55%),rgba(2,8,23,0.92)] px-6 py-10 text-center sm:px-10">
      <div className="mx-auto max-w-3xl">
        <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-300">Infrastructure is no longer passive</div>
        <h2 className="mt-4 text-4xl font-black tracking-[-0.05em] text-white sm:text-5xl">
          Control it.
        </h2>
        <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-base">
          Open the live Control Surface, inspect the proof posture, and watch the system decide
          where compute runs before the workload ever starts.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/console"
            className="rounded-2xl bg-gradient-to-r from-emerald-300 via-cyan-300 to-sky-400 px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-slate-950"
          >
            Open Control Surface
          </Link>
          <a
            href="#live-decision"
            className="rounded-2xl border border-white/12 bg-white/5 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white"
          >
            Replay the live decision
          </a>
          <Link
            href="/contact"
            className="rounded-2xl border border-white/12 bg-white/5 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white"
          >
            Talk to the team
          </Link>
        </div>
      </div>
    </section>
  )
}
