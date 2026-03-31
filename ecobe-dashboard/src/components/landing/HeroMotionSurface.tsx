'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'

import { CO2RouterLogo } from '@/components/CO2RouterLogo'
import { formatAction } from '@/components/control-surface/action-styles'
import type { ControlSurfaceDecisionSummary } from '@/types/control-surface'

const flowNodes = [
  { left: '8%', top: '20%', size: 12 },
  { left: '22%', top: '64%', size: 8 },
  { left: '41%', top: '28%', size: 10 },
  { left: '58%', top: '70%', size: 12 },
  { left: '76%', top: '22%', size: 8 },
  { left: '90%', top: '58%', size: 10 },
]

export function HeroMotionSurface({
  liveDecision,
}: {
  liveDecision: ControlSurfaceDecisionSummary | null
}) {
  const actionMeta = liveDecision ? formatAction(liveDecision.action) : null
  const workloadLabel = liveDecision?.workloadLabel ?? 'Live decision frame hydrating'
  const baselineCarbon = liveDecision?.baselineCarbonIntensity
  const waterStressIndex = liveDecision?.waterStressIndex
  const selectedRegion = liveDecision?.selectedRegion
  const carbonDelta = liveDecision?.carbonReductionPct
  const signalConfidence = liveDecision?.signalConfidence
  const totalLatency = liveDecision?.latencyMs?.total

  return (
    <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.18),transparent_38%),linear-gradient(180deg,rgba(5,10,20,0.96),rgba(2,8,18,0.98))] px-6 py-8 shadow-[0_25px_120px_rgba(0,0,0,0.45)] sm:px-10 sm:py-10 lg:px-12 lg:py-12">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(91,192,255,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(91,192,255,0.07)_1px,transparent_1px)] bg-[size:72px_72px] opacity-40" />
        <motion.div
          className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent"
          animate={{ opacity: [0.2, 0.75, 0.2], scaleX: [0.92, 1, 0.92] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />
        {flowNodes.map((node, index) => (
          <motion.div
            key={`${node.left}-${node.top}`}
            className="absolute rounded-full bg-cyan-300/80"
            style={{ left: node.left, top: node.top, width: node.size, height: node.size }}
            animate={{
              opacity: [0.15, 0.85, 0.15],
              scale: [0.8, 1.15, 0.8],
            }}
            transition={{
              duration: 3.5 + index * 0.35,
              repeat: Infinity,
              delay: index * 0.25,
              ease: 'easeInOut',
            }}
          />
        ))}
        <motion.div
          className="absolute left-[-15%] top-[24%] h-[2px] w-[70%] origin-left rounded-full bg-gradient-to-r from-transparent via-emerald-300/70 to-transparent"
          animate={{ x: ['-6%', '88%'] }}
          transition={{ duration: 6.5, repeat: Infinity, ease: 'linear' }}
        />
      </div>

      <div className="relative grid gap-10 lg:grid-cols-[1.2fr_0.9fr] lg:items-end">
        <div className="max-w-3xl">
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <div className="rounded-full border border-emerald-400/20 bg-emerald-400/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-300">
              Live execution authority
            </div>
            <CO2RouterLogo size="lg" orientation="lockup" />
          </div>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-4xl text-5xl font-black leading-[0.94] tracking-[-0.06em] text-white sm:text-6xl lg:text-7xl"
          >
            Compute does not run until it is authorized.
            <span className="mt-2 block bg-gradient-to-r from-emerald-300 via-cyan-300 to-sky-400 bg-clip-text text-transparent">
              CO2 Router issues the binding decision.
            </span>
          </motion.h1>
          <p className="mt-6 max-w-3xl text-base leading-8 text-slate-300 sm:text-lg">
            CO2 Router is a deterministic environmental execution control plane. It evaluates
            carbon, water, latency, cost, and policy before workloads run, then attaches proof,
            trace, replay, and provenance to the same decision frame.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/console"
              className="rounded-2xl bg-gradient-to-r from-emerald-300 via-cyan-300 to-sky-400 px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-slate-950 transition hover:brightness-105"
            >
              Open Control Surface
            </Link>
            <Link
              href="/methodology"
              className="rounded-2xl border border-cyan-300/20 bg-cyan-300/8 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-300/12"
            >
              Read Methodology
            </Link>
            <a
              href="#live-decision"
              className="rounded-2xl border border-white/12 bg-white/5 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:border-cyan-300/40 hover:bg-cyan-300/8"
            >
              Watch Live Decisions
            </a>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-[28px] border border-white/10 bg-slate-950/65 p-5 shadow-[0_18px_80px_rgba(0,0,0,0.32)] backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                Authorization request
              </span>
              <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200">
                pre-execution
              </span>
            </div>
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
                <div className="text-sm font-semibold text-white">
                  {workloadLabel}
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                  <span>baseline</span>
                  <span className="rounded-full bg-white/6 px-2 py-1 text-slate-200">
                    {baselineCarbon != null ? `${baselineCarbon} gCO2/kWh` : 'awaiting live carbon'}
                  </span>
                  <span className="rounded-full bg-white/6 px-2 py-1 text-slate-200">
                    {waterStressIndex != null ? `${waterStressIndex.toFixed(1)} stress` : 'water posture pending'}
                  </span>
                </div>
              </div>
              <motion.div
                className="flex items-center justify-center"
                animate={{ y: [0, 4, 0] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
              >
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.24em] text-slate-300">
                  decision engine
                </div>
              </motion.div>
              <div className="rounded-2xl border border-white/8 bg-gradient-to-br from-white/8 to-transparent p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
                      binding outcome
                    </div>
                    <div className="mt-2 text-xl font-bold text-white">
                      {actionMeta?.label ?? 'Shell Ready'}
                    </div>
                  </div>
                  {actionMeta && (
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${actionMeta.badge}`}>
                      {actionMeta.label}
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                  <span className="rounded-full bg-white/6 px-2 py-1">
                    {selectedRegion ?? 'region pending'}
                  </span>
                  <span className="rounded-full bg-white/6 px-2 py-1">
                    {carbonDelta != null ? `${carbonDelta.toFixed(1)}% carbon delta` : 'carbon delta pending'}
                  </span>
                  <span className="rounded-full bg-white/6 px-2 py-1">
                    {signalConfidence != null ? `${signalConfidence.toFixed(2)} confidence` : 'signal confidence pending'}
                  </span>
                  <span className="rounded-full bg-white/6 px-2 py-1">
                    {totalLatency != null ? `${totalLatency.toFixed(0)} ms` : 'latency pending'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {[
              { label: 'Execution', value: 'pre-execution control' },
              { label: 'Governance', value: 'SAIQ + policy state' },
              { label: 'Proof', value: 'trace + replay + provenance' },
            ].map((item) => (
              <div
                key={item.label}
                className="min-w-[150px] flex-1 rounded-2xl border border-white/8 bg-white/4 px-4 py-3 backdrop-blur"
              >
                <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                  {item.label}
                </div>
                <div className="mt-2 text-sm font-semibold text-white">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
