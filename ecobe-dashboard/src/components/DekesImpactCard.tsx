'use client'

import { useQuery } from '@tanstack/react-query'
import { ecobeApi } from '@/lib/api'
import { Loader2, Zap } from 'lucide-react'
import type { DashboardDecision } from '@/types'
import { getQualityTierBadge } from '@/types'
import { getDecisionSource, isDecisionDelayed, deriveQualityTier } from '@/lib/decisions'

function isToday(iso: string): boolean {
  const d = new Date(iso)
  const now = new Date()
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
}

export function DekesImpactCard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['decisions', 500],
    queryFn: () => ecobeApi.getDecisions(500),
    refetchInterval: 30_000,
  })

  const allDecisions = data?.decisions ?? []
  const dekesDecisions = allDecisions.filter((d) => getDecisionSource(d) === 'DEKES')

  if (!isLoading && !isError && dekesDecisions.length === 0) return null

  const runsToday = dekesDecisions.filter((d) => isToday(d.createdAt)).length

  const deltas = dekesDecisions
    .filter(
      (d) =>
        d.carbonIntensityBaselineGPerKwh != null && d.carbonIntensityChosenGPerKwh != null
    )
    .map((d) => d.carbonIntensityBaselineGPerKwh! - d.carbonIntensityChosenGPerKwh!)

  const avgDelta = deltas.length > 0 ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null

  const delayed = dekesDecisions.filter(isDecisionDelayed).length

  const avgDelayApplied =
    dekesDecisions.length > 0 ? (delayed / dekesDecisions.length) * 100 : 0

  const policyBlocksPrevented = delayed

  // Quality tier distribution
  const tiers = { high: 0, medium: 0, low: 0 }
  for (const d of dekesDecisions) {
    tiers[deriveQualityTier(d)]++
  }
  const total = dekesDecisions.length || 1

  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Zap className="w-5 h-5 text-emerald-400" />
        <div>
          <h3 className="text-lg font-semibold text-white">DEKES Workload Routing</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            DEKES-sourced decisions routed through ECOBE carbon engine
          </p>
        </div>
        <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          DEKES
        </span>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
        </div>
      )}

      {!isLoading && dekesDecisions.length > 0 && (
        <>
          {/* Stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-slate-800/40 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-1">Runs today</p>
              <p className="text-2xl font-bold text-white">{runsToday}</p>
              <p className="text-xs text-slate-500 mt-0.5">of {dekesDecisions.length} total</p>
            </div>
            <div className="bg-slate-800/40 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-1">Avg carbon delta</p>
              <p className="text-2xl font-bold text-emerald-400">
                {avgDelta != null ? `${avgDelta > 0 ? '+' : ''}${avgDelta.toFixed(0)}` : '—'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">g/kWh saved</p>
            </div>
            <div className="bg-slate-800/40 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-1">Avg delay applied</p>
              <p className="text-2xl font-bold text-yellow-400">{avgDelayApplied.toFixed(0)}%</p>
              <p className="text-xs text-slate-500 mt-0.5">of DEKES runs</p>
            </div>
            <div className="bg-slate-800/40 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-1">Policy blocks prevented</p>
              <p className="text-2xl font-bold text-sky-400">{policyBlocksPrevented}</p>
              <p className="text-xs text-slate-500 mt-0.5">reroutes / delays</p>
            </div>
          </div>

          {/* Quality tier distribution */}
          <div>
            <p className="text-xs text-slate-400 mb-2">Quality tier distribution</p>
            <div className="flex gap-1 h-3 rounded-full overflow-hidden">
              <div
                className="bg-emerald-500 transition-all"
                style={{ width: `${(tiers.high / total) * 100}%` }}
                title={`High: ${tiers.high}`}
              />
              <div
                className="bg-yellow-500 transition-all"
                style={{ width: `${(tiers.medium / total) * 100}%` }}
                title={`Medium: ${tiers.medium}`}
              />
              <div
                className="bg-red-500 transition-all"
                style={{ width: `${(tiers.low / total) * 100}%` }}
                title={`Low: ${tiers.low}`}
              />
            </div>
            <div className="flex gap-4 mt-2 text-xs">
              <span className={getQualityTierBadge('high') + ' px-2 py-0.5 rounded'}>
                HIGH {((tiers.high / total) * 100).toFixed(0)}%
              </span>
              <span className={getQualityTierBadge('medium') + ' px-2 py-0.5 rounded'}>
                MED {((tiers.medium / total) * 100).toFixed(0)}%
              </span>
              <span className={getQualityTierBadge('low') + ' px-2 py-0.5 rounded'}>
                LOW {((tiers.low / total) * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
