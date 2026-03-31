'use client'

import { motion } from 'framer-motion'

import { formatAction } from '@/components/control-surface/action-styles'
import { humanizeReasonCode, latencyToneClass } from '@/lib/control-surface/labels'
import type { CiRouteResponse } from '@/types/control-surface'

const inputLabels = ['Carbon', 'Water', 'Cost', 'Latency', 'Policy', 'Confidence']

export function RouterCorePanel({
  decision,
}: {
  decision: CiRouteResponse
}) {
  const action = formatAction(decision.decision)

  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
      <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">Decision engine core</div>
      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_0.9fr] lg:items-center">
        <div className="relative flex min-h-[240px] items-center justify-center overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.14),transparent_50%),rgba(2,8,23,0.82)]">
          <motion.div
            className="absolute h-52 w-52 rounded-full border border-cyan-300/18"
            animate={{ rotate: 360 }}
            transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
          />
          <motion.div
            className="absolute h-72 w-72 rounded-full border border-emerald-300/10"
            animate={{ rotate: -360 }}
            transition={{ duration: 34, repeat: Infinity, ease: 'linear' }}
          />
          {inputLabels.map((label, index) => (
            <motion.div
              key={label}
              className="absolute rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-slate-300"
              style={{
                left: `${50 + Math.cos((index / inputLabels.length) * Math.PI * 2) * 34}%`,
                top: `${50 + Math.sin((index / inputLabels.length) * Math.PI * 2) * 34}%`,
                transform: 'translate(-50%, -50%)',
              }}
              animate={{ opacity: [0.45, 1, 0.45] }}
              transition={{ duration: 2.4 + index * 0.2, repeat: Infinity, ease: 'easeInOut' }}
            >
              {label}
            </motion.div>
          ))}
          <div className="relative z-10 flex h-36 w-36 items-center justify-center rounded-full border border-cyan-300/24 bg-slate-950/90 text-center shadow-[0_0_80px_rgba(34,211,238,0.16)]">
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">CO2 Router</div>
              <div className="mt-2 text-lg font-black tracking-[0.12em] text-white">Core</div>
              <div className={`mt-2 text-xs font-semibold uppercase tracking-[0.2em] ${action.text}`}>
                {action.label}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3">
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Selected region</div>
            <div className="mt-2 text-2xl font-bold text-white">{decision.selectedRegion}</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Carbon delta</div>
              <div className="mt-2 text-xl font-bold text-white">
                {decision.savings.carbonReductionPct.toFixed(1)}%
              </div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Water delta</div>
              <div className="mt-2 text-xl font-bold text-white">
                {decision.savings.waterImpactDeltaLiters.toFixed(2)} L
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Total latency</div>
              <div className={`mt-2 text-xl font-bold ${latencyToneClass(decision.latencyMs?.total)}`}>
                {decision.latencyMs?.total?.toFixed(0) ?? '--'} ms
              </div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Compute path</div>
              <div className={`mt-2 text-xl font-bold ${latencyToneClass(decision.latencyMs?.compute)}`}>
                {decision.latencyMs?.compute?.toFixed(0) ?? '--'} ms
              </div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Cache mode</div>
              <div className="mt-2 text-xl font-bold text-white">
                {decision.latencyMs?.cacheStatus ?? 'live'}
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Policy doctrine</div>
            <div className="mt-2 text-sm text-slate-300">
              {(decision.policyTrace.reasonCodes ?? [])
                .slice(0, 3)
                .map(humanizeReasonCode)
                .join(' · ') || 'No doctrine trace'}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
