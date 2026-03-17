'use client'

import { getQualityTierBadge, getCarbonLevel } from '@/types'
import { useDashboardSavings, useRecentDecisions } from '@/lib/hooks/dashboard-data'

export function CarbonReductionMultiplier() {
  const { data: decisionResponse } = useRecentDecisions(100)
  const { data: savings } = useDashboardSavings('30d')

  const decisions = decisionResponse?.decisions ?? []

  // Compute CRM: baseline_ci / chosen_ci per decision
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

  // Best multiplier in the most recent 24 decisions
  const best24 = ratios.slice(0, 24)
  const bestRatio = best24.length > 0 ? Math.max(...best24.map((r) => r.ratio)) : null

  const heroRatio = latestRatio?.ratio ?? null
  const heroDecision = latestRatio?.decision

  // Baseline bar width (always 100%), chosen bar = chosen/baseline * 100
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
    <div className="bg-gradient-to-br from-slate-900 to-slate-950 rounded-xl border border-slate-700 p-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Hero multiplier */}
        <div className="lg:col-span-2 space-y-4">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">
              Carbon Reduction Multiplier
            </p>
            <div className="flex items-baseline gap-3">
              <span className="text-6xl font-black text-white leading-none">
                {heroRatio != null ? heroRatio.toFixed(1) : '—'}
              </span>
              <span className="text-2xl font-bold text-emerald-400">×</span>
              <span className="text-xl font-semibold text-slate-300">Cleaner Compute</span>
            </div>
          </div>

          {/* Visual comparison bars */}
          {heroDecision && chosenPct != null && (
            <div className="space-y-2.5">
              {/* Baseline bar */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 w-24 flex-shrink-0 text-right font-mono">
                  {heroDecision.baselineRegion}
                </span>
                <div className="flex-1 bg-red-500/20 rounded h-6 flex items-center px-2">
                  <div className="w-full bg-red-500/50 rounded h-3" />
                </div>
                <span className="text-xs text-red-400 w-24 flex-shrink-0 font-mono">
                  {heroDecision.carbonIntensityBaselineGPerKwh} gCO₂
                </span>
              </div>
              {/* Chosen bar */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-emerald-400 w-24 flex-shrink-0 text-right font-mono font-semibold">
                  {heroDecision.chosenRegion}
                </span>
                <div className="flex-1 bg-slate-800 rounded h-6 flex items-center px-2">
                  <div
                    className={`rounded h-3 ${
                      chosenLevel === 'low'
                        ? 'bg-emerald-500'
                        : chosenLevel === 'medium'
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                    }`}
                    style={{ width: `${chosenPct}%` }}
                  />
                </div>
                <span className="text-xs text-emerald-400 w-24 flex-shrink-0 font-mono font-semibold">
                  {heroDecision.carbonIntensityChosenGPerKwh} gCO₂
                </span>
              </div>
            </div>
          )}

          {/* Supporting context */}
          {heroDecision && (
            <div className="flex flex-wrap gap-3 text-xs">
              <span className="text-slate-500">
                Delta:{' '}
                <span className="text-sky-400 font-semibold">
                  {heroDecision.carbonIntensityBaselineGPerKwh != null &&
                  heroDecision.carbonIntensityChosenGPerKwh != null
                    ? Math.round(
                        heroDecision.carbonIntensityBaselineGPerKwh -
                          heroDecision.carbonIntensityChosenGPerKwh
                      )
                    : '—'}{' '}
                  gCO₂/kWh
                </span>
              </span>
              <span
                className={`px-2 py-0.5 rounded-full font-medium ${getQualityTierBadge(qualityTier)}`}
              >
                Confidence: {qualityTier.toUpperCase()}
              </span>
              {heroDecision.workloadName && (
                <span className="text-slate-500 font-mono">{heroDecision.workloadName}</span>
              )}
            </div>
          )}

          {!heroDecision && (
            <p className="text-sm text-slate-600">
              Connect engine and route workloads to see carbon reduction multiplier
            </p>
          )}
        </div>

        {/* Supporting stats */}
        <div className="grid grid-cols-3 lg:grid-cols-1 gap-3">
          <Stat
            label="Avg Multiplier"
            value={avgRatio != null ? `${avgRatio.toFixed(1)}×` : '—'}
            sub="last 100 decisions"
            color="text-emerald-400"
          />
          <Stat
            label="Best Today"
            value={bestRatio != null ? `${bestRatio.toFixed(1)}×` : '—'}
            sub="highest single CRM"
            color="text-sky-400"
          />
          <Stat
            label="CO₂ Avoided"
            value={savedKg != null ? `${savedKg}` : '—'}
            sub="tons this month"
            color="text-teal-400"
          />
        </div>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  sub,
  color,
}: {
  label: string
  value: string
  sub: string
  color: string
}) {
  return (
    <div className="bg-slate-800/40 rounded-lg p-3">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-slate-600 mt-0.5">{sub}</p>
    </div>
  )
}
