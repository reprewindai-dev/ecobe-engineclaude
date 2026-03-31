'use client'

import { motion } from 'framer-motion'

import { formatAction } from '@/components/control-surface/action-styles'
import { latencyToneClass } from '@/lib/control-surface/labels'
import type { CiRouteResponse } from '@/types/control-surface'

export function LiveDecisionTheater({
  decision,
  explainSimply,
}: {
  decision: CiRouteResponse
  explainSimply: boolean
}) {
  const action = formatAction(decision.decision)
  const actionDescription = explainSimply ? action.simple : decision.recommendation
  const totalLatency = decision.latencyMs?.total ?? null
  const computeLatency = decision.latencyMs?.compute ?? null
  const providerLatency = decision.latencyMs?.providerResolution ?? null

  return (
    <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(45,212,191,0.16),transparent_36%),rgba(2,8,23,0.92)] p-6 shadow-[0_24px_120px_rgba(0,0,0,0.36)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.26em] text-cyan-300">Live Decision Theater</div>
          <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-white">
            Watch the engine intercept execution.
          </h2>
        </div>
        <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${action.badge}`}>
          {action.label}
        </span>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[0.9fr_1.2fr_0.9fr]">
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Incoming job</div>
          <div className="mt-3 text-lg font-semibold text-white">Pipeline workload</div>
          <div className="mt-4 space-y-2 text-sm text-slate-300">
            <div>baseline region: {decision.baseline.region}</div>
            <div>baseline carbon: {decision.baseline.carbonIntensity} gCO2/kWh</div>
            <div>baseline water: {decision.baseline.waterImpactLiters.toFixed(2)} L</div>
            <div className={latencyToneClass(totalLatency)}>decision latency: {totalLatency?.toFixed(0) ?? '--'} ms</div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/70 p-5">
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(34,211,238,0.08),transparent,rgba(16,185,129,0.08))]" />
          <div className="relative grid min-h-[220px] items-center gap-5">
            <div className="flex items-center justify-between gap-3">
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-300">
                request
              </div>
              <motion.div
                className="h-[2px] flex-1 rounded-full bg-gradient-to-r from-cyan-300/60 via-emerald-300/80 to-transparent"
                animate={{ backgroundPosition: ['0% 50%', '100% 50%'] }}
                transition={{ duration: 2.8, repeat: Infinity, ease: 'linear' }}
              />
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-300">
                outcome
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-[0.95fr_0.7fr_0.95fr] md:items-center">
              <motion.div
                className="rounded-[24px] border border-cyan-300/12 bg-cyan-300/7 p-4"
                animate={{ x: [0, 6, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              >
                <div className="text-sm font-semibold text-white">Job request</div>
                <div className="mt-2 text-xs text-slate-300">
                  Carbon, water, policy, and latency are loaded before execution.
                </div>
              </motion.div>
              <div className="flex justify-center">
                <motion.div
                  className="flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-center text-[11px] uppercase tracking-[0.2em] text-white"
                  animate={{ scale: [0.96, 1.04, 0.96] }}
                  transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                >
                  CO2 Router
                </motion.div>
              </div>
              <motion.div
                className={`rounded-[24px] border p-4 ${action.border} bg-white/[0.05]`}
                animate={{
                  opacity: [0.82, 1, 0.82],
                  boxShadow: [
                    '0 0 0 rgba(0,0,0,0)',
                    '0 0 45px rgba(34,211,238,0.12)',
                    '0 0 0 rgba(0,0,0,0)',
                  ],
                }}
                transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
              >
                <div className={`text-sm font-semibold ${action.text}`}>{action.label}</div>
                <div className="mt-2 text-xs text-slate-300">{actionDescription}</div>
                <div className="mt-3 grid gap-2 text-[11px] text-slate-300 sm:grid-cols-3">
                  <div className={latencyToneClass(totalLatency)}>total {totalLatency?.toFixed(0) ?? '--'}ms</div>
                  <div className={latencyToneClass(computeLatency)}>compute {computeLatency?.toFixed(0) ?? '--'}ms</div>
                  <div>providers {providerLatency?.toFixed(0) ?? '--'}ms</div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Execution target</div>
          <div className="mt-3 text-lg font-semibold text-white">{decision.selectedRegion}</div>
          <div className="mt-4 space-y-2 text-sm text-slate-300">
            <div>runner: {decision.selectedRunner}</div>
            <div>selected carbon: {decision.selected.carbonIntensity} gCO2/kWh</div>
            <div>selected water: {decision.selected.waterImpactLiters.toFixed(2)} L</div>
            <div>confidence: {(decision.signalConfidence * 100).toFixed(0)}%</div>
            <div>cache mode: {decision.latencyMs?.cacheStatus ?? 'live'}</div>
          </div>
        </div>
      </div>
    </section>
  )
}
