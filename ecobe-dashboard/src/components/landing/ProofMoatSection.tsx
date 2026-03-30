'use client'

import { motion } from 'framer-motion'

import type { ReplayBundle } from '@/types/control-surface'

export function ProofMoatSection({
  replay,
}: {
  replay: ReplayBundle | null
}) {
  const proof = replay?.persisted?.proofRecord ?? replay?.replay.proofRecord
  const traceReasons = (replay?.persisted?.policyTrace?.reasonCodes ??
    replay?.replay.policyTrace?.reasonCodes ??
    []) as string[]

  return (
    <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
        <div className="text-[11px] uppercase tracking-[0.28em] text-emerald-300">Proof infrastructure</div>
        <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl">
          Every decision carries inspectable evidence.
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
          Baseline vs selected region, signal lineage, governance state, and replay posture stay
          inside the same execution frame. That is what turns a recommendation system into
          authority infrastructure.
        </p>
        <div className="mt-6 space-y-3 text-sm text-slate-300">
          <div>Baseline vs selected region and impact are preserved.</div>
          <div>Signal provenance and dataset versions are attached to the proof record.</div>
          <div>Replay can verify whether the engine still reaches the same deterministic outcome.</div>
        </div>
      </div>

      <div className="rounded-[28px] border border-cyan-300/16 bg-slate-950/72 p-6 shadow-[0_24px_120px_rgba(0,0,0,0.35)]">
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-300">Proof chain</div>
          <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-slate-300">
            {replay?.deterministicMatch ? 'replay verified' : 'live proof sample'}
          </div>
        </div>
        <div className="mt-6 flex items-center gap-3 overflow-x-auto pb-2">
          {['Input', 'Signals', 'Policy', 'Decision', 'Proof'].map((block, index) => (
            <motion.div
              key={block}
              className="relative min-w-[120px] rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-5 text-center"
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 3 + index * 0.3, repeat: Infinity, ease: 'easeInOut' }}
            >
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">block {index + 1}</div>
              <div className="mt-2 text-sm font-semibold text-white">{block}</div>
            </motion.div>
          ))}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">proof record</div>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              <div>job_id: {proof?.job_id ?? 'unavailable'}</div>
              <div>selected_region: {proof?.selected_region ?? 'unavailable'}</div>
              <div>proof_hash: {proof?.proof_hash?.slice(0, 18) ?? 'unavailable'}</div>
              <div>confidence: {proof?.confidence_score?.toFixed(2) ?? '0.00'}</div>
            </div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">policy trace</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {traceReasons.slice(0, 4).map((reason) => (
                <span
                  key={reason}
                  className="rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[11px] text-slate-300"
                >
                  {reason}
                </span>
              ))}
            </div>
            <div className="mt-3 text-xs text-slate-400">
              replay {replay?.deterministicMatch ? 'deterministic match' : 'available on frame'}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

