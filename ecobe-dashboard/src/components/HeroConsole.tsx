'use client'

import { useEffect, useMemo, useState } from 'react'

import { BrandLogo } from './BrandLogo'

export type HeroConsoleFrame = {
  workload: string
  requestedRegion: string
  decision: 'run_now' | 'reroute' | 'delay' | 'throttle' | 'deny'
  reasonCode: string
  timestamp: string
  proofHash: string
  doctrineVersion: string
  assuranceStatus: string
  latencyLabel: string
  mode: 'live' | 'degraded' | 'simulation'
}

type HeroConsoleProps = {
  frames: HeroConsoleFrame[]
}

function displayAction(action: HeroConsoleFrame['decision']) {
  return action.replace('_', ' ')
}

export function HeroConsole({ frames }: HeroConsoleProps) {
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    if (frames.length <= 1) return

    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % frames.length)
    }, 3600)

    return () => window.clearInterval(interval)
  }, [frames.length])

  const activeFrame = useMemo(() => frames[activeIndex] ?? frames[0], [activeIndex, frames])

  const toneClass =
    activeFrame.decision === 'run_now'
      ? 'text-emerald-200 border-emerald-300/20 bg-emerald-400/10'
      : activeFrame.decision === 'reroute'
        ? 'text-cyan-200 border-cyan-300/20 bg-cyan-400/10'
        : activeFrame.decision === 'delay'
          ? 'text-amber-200 border-amber-300/20 bg-amber-400/10'
          : activeFrame.decision === 'throttle'
            ? 'text-orange-200 border-orange-300/20 bg-orange-400/10'
            : 'text-rose-200 border-rose-300/20 bg-rose-400/10'

  return (
    <div className="hero-console surface-card-strong relative overflow-hidden p-6 shadow-[0_30px_120px_rgba(2,6,23,0.55)]">
      <div className="pointer-events-none absolute inset-y-0 right-0 w-48 bg-[radial-gradient(circle_at_center,rgba(109,225,255,0.18),transparent_68%)]" />
      <div className="pointer-events-none absolute -bottom-10 right-0 opacity-[0.1]">
        <BrandLogo variant="full" className="h-auto w-64" alt="" />
      </div>
      <div className="pointer-events-none absolute left-0 top-0 h-full w-full bg-[linear-gradient(135deg,rgba(109,225,255,0.08),transparent_32%,transparent_68%,rgba(195,255,145,0.1))]" />

      <div className="relative z-10">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <BrandLogo variant="icon" className="h-12 w-auto shrink-0" />
            <div>
              <div className="eyebrow">CO2 Router Console</div>
              <div className="mt-1 text-xl font-semibold text-white">Live decision surface</div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs uppercase tracking-[0.2em] text-slate-300">
            <span className="h-2.5 w-2.5 rounded-full bg-cyan-300 pulse-dot" />
            {activeFrame.mode}
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="eyebrow">Workload</div>
            <div className="mt-2 text-lg font-semibold text-white">{activeFrame.workload}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="eyebrow">Requested region</div>
            <div className="mt-2 text-lg font-semibold text-white">{activeFrame.requestedRegion}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="eyebrow">Decision</div>
            <div className="mt-3 flex items-center gap-3">
              <span className={`pill ${toneClass}`}>{displayAction(activeFrame.decision)}</span>
              <span className="font-mono text-xs text-slate-400 terminal-cursor">{activeFrame.reasonCode}</span>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="eyebrow">Timestamp</div>
            <div className="mt-2 text-lg font-semibold text-white">{activeFrame.timestamp}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="eyebrow">Proof hash</div>
            <div className="mt-2 font-mono text-xs text-slate-200">{activeFrame.proofHash}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="eyebrow">Policy / assurance</div>
            <div className="mt-2 text-sm leading-7 text-slate-200">
              {activeFrame.doctrineVersion}
              <span className="mx-2 text-slate-500">/</span>
              {activeFrame.assuranceStatus}
              <span className="mx-2 text-slate-500">/</span>
              {activeFrame.latencyLabel}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
