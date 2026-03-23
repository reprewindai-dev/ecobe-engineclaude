'use client'

import { useEffect, useRef, useState } from 'react'
import { getQualityTierBadge, getCarbonLevel } from '@/types'
import { useDashboardSavings, useRecentDecisions } from '@/lib/hooks/dashboard-data'

/** Animated number that counts up from 0 to target */
function AnimatedNumber({ value, decimals = 1, suffix = '', className = '' }: {
  value: number | null
  decimals?: number
  suffix?: string
  className?: string
}) {
  const [display, setDisplay] = useState(0)
  const ref = useRef<number>(0)

  useEffect(() => {
    if (value == null) return
    const start = ref.current
    const diff = value - start
    const duration = 800
    const startTime = performance.now()

    function animate(time: number) {
      const elapsed = time - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3) // ease-out cubic
      const current = start + diff * eased
      setDisplay(current)
      ref.current = current
      if (progress < 1) requestAnimationFrame(animate)
    }

    requestAnimationFrame(animate)
  }, [value])

  if (value == null) return <span className={className}>—</span>
  return <span className={className}>{display.toFixed(decimals)}{suffix}</span>
}

export function CarbonReductionMultiplier() {
  const { data: decisionResponse } = useRecentDecisions(100)
  const { data: savings } = useDashboardSavings('30d')

  const decisions = decisionResponse?.decisions ?? []

  const validDecisions = decisions.filter(
    (d) =>
      d.carbonIntensityBaselineGPerKwh != null &&
      d.carbonIntensityChosenGPerKwh != null &&
      d.carbonIntensityChosenGPerKwh > 0 &&
      !d.fallbackUsed
  )

  const ratios = validDecisions.map((d) => ({
    ratio: d.carbonIntensityBaselineGPerKwh! / d.carbonIntensityChosenGPerKwh!,
    decision: d,
  }))

  const latestRatio = ratios[0]
  const avgRatio =
    ratios.length > 0 ? ratios.reduce((sum, r) => sum + r.ratio, 0) / ratios.length : null

  const best24 = ratios.slice(0, 24)
  const bestRatio = best24.length > 0 ? Math.max(...best24.map((r) => r.ratio)) : null

  const heroRatio = latestRatio?.ratio ?? null
  const heroDecision = latestRatio?.decision

  const chosenPct =
    heroDecision?.carbonIntensityBaselineGPerKwh != null &&
    heroDecision.carbonIntensityChosenGPerKwh != null
      ? Math.round(
          (heroDecision.carbonIntensityChosenGPerKwh /
            heroDecision.carbonIntensityBaselineGPerKwh) *
            100
        )
      : null

  const chosenLevel =
    heroDecision?.carbonIntensityChosenGPerKwh != null
      ? getCarbonLevel(heroDecision.carbonIntensityChosenGPerKwh)
      : null

  const qualityTier =
    heroDecision && !heroDecision.fallbackUsed
      ? heroDecision.dataFreshnessSeconds != null && heroDecision.dataFreshnessSeconds < 600
        ? ('high' as const)
        : ('medium' as const)
      : ('low' as const)

  const savedKg = savings ? (savings.totalCO2SavedG / 1_000_000).toFixed(3) : null

  return (
    <div className="glass-card-glow rounded-2xl p-6 relative overflow-hidden">
      {/* Decorative glow orbs */}
      <div className="absolute -top-20 -right-20 w-60 h-60 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none" />

      <div className="relative grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Hero multiplier */}
        <div className="lg:col-span-2 space-y-4">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2">
              Carbon Reduction Multiplier
            </p>
            <div className="flex items-baseline gap-3">
              <AnimatedNumber
                value={heroRatio}
                decimals={1}
                className="text-7xl font-black text-white leading-none tracking-tight neon-green animate-count"
              />
              <span className="text-3xl font-bold gradient-text-fast">&times;</span>
              <span className="text-lg font-semibold text-slate-400">Cleaner Compute</span>
            </div>
          </div>

          {/* Visual comparison bars — animated */}
          {heroDecision && chosenPct != null && (
            <div className="space-y-3 mt-2">
              {/* Baseline bar */}
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-slate-500 w-20 flex-shrink-0 text-right font-mono">
                  {heroDecision.baselineRegion}
                </span>
                <div className="flex-1 bg-red-500/10 rounded-full h-5 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-red-500/60 to-red-400/40 rounded-full transition-all duration-1000 ease-out"
                    style={{ width: '100%' }}
                  />
                </div>
                <span className="text-[10px] text-red-400 w-20 flex-shrink-0 font-mono">
                  {heroDecision.carbonIntensityBaselineGPerKwh} gCO₂
                </span>
              </div>
              {/* Chosen bar */}
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-emerald-400 w-20 flex-shrink-0 text-right font-mono font-semibold">
                  {heroDecision.chosenRegion}
                </span>
                <div className="flex-1 bg-slate-800/50 rounded-full h-5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ease-out ${
                      chosenLevel === 'low'
                        ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                        : chosenLevel === 'medium'
                          ? 'bg-gradient-to-r from-yellow-500 to-amber-400'
                          : 'bg-gradient-to-r from-red-500 to-red-400'
                    }`}
                    style={{ width: `${chosenPct}%` }}
                  />
                </div>
                <span className="text-[10px] text-emerald-400 w-20 flex-shrink-0 font-mono font-semibold">
                  {heroDecision.carbonIntensityChosenGPerKwh} gCO₂
                </span>
              </div>
            </div>
          )}

          {/* Context badges */}
          {heroDecision && (
            <div className="flex flex-wrap gap-2 text-[10px] mt-1">
              <span className="px-2.5 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 font-semibold">
                Delta:{' '}
                {heroDecision.carbonIntensityBaselineGPerKwh != null &&
                heroDecision.carbonIntensityChosenGPerKwh != null
                  ? Math.round(
                      heroDecision.carbonIntensityBaselineGPerKwh -
                        heroDecision.carbonIntensityChosenGPerKwh
                    )
                  : '—'}{' '}
                gCO₂/kWh
              </span>
              <span
                className={`px-2.5 py-1 rounded-full font-semibold ${getQualityTierBadge(qualityTier)}`}
              >
                {qualityTier.toUpperCase()}
              </span>
              {heroDecision.workloadName && (
                <span className="px-2.5 py-1 rounded-full bg-slate-800/50 text-slate-400 font-mono">
                  {heroDecision.workloadName}
                </span>
              )}
            </div>
          )}

          {!heroDecision && (
            <div className="flex items-center gap-3 mt-4 py-4 px-5 rounded-xl bg-slate-800/20 border border-slate-700/30">
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-breathe" />
              <p className="text-sm text-slate-500">
                Waiting for engine connection — route workloads to see carbon reduction
              </p>
            </div>
          )}
        </div>

        {/* Supporting stats — glowing cards */}
        <div className="grid grid-cols-3 lg:grid-cols-1 gap-3">
          <StatCard
            label="Avg Multiplier"
            value={avgRatio}
            format={(v) => `${v.toFixed(1)}×`}
            sub="last 100 decisions"
            color="emerald"
          />
          <StatCard
            label="Best Today"
            value={bestRatio}
            format={(v) => `${v.toFixed(1)}×`}
            sub="highest single CRM"
            color="cyan"
          />
          <StatCard
            label="CO₂ Avoided"
            value={savedKg ? parseFloat(savedKg) : null}
            format={(v) => v.toFixed(3)}
            sub="tons this month"
            color="teal"
          />
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  format,
  sub,
  color,
}: {
  label: string
  value: number | null
  format: (v: number) => string
  sub: string
  color: 'emerald' | 'cyan' | 'teal'
}) {
  const colorMap = {
    emerald: {
      text: 'text-emerald-400',
      bg: 'bg-emerald-500/5',
      border: 'border-emerald-500/10',
    },
    cyan: {
      text: 'text-cyan-400',
      bg: 'bg-cyan-500/5',
      border: 'border-cyan-500/10',
    },
    teal: {
      text: 'text-teal-400',
      bg: 'bg-teal-500/5',
      border: 'border-teal-500/10',
    },
  }

  const c = colorMap[color]

  return (
    <div className={`${c.bg} border ${c.border} rounded-xl p-3 hover-lift`}>
      <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold ${c.text}`}>
        {value != null ? format(value) : '—'}
      </p>
      <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>
    </div>
  )
}
