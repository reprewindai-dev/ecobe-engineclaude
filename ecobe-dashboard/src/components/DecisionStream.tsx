'use client'

import { useQuery } from '@tanstack/react-query'
import { ecobeApi } from '@/lib/api'
import { getQualityTierBadge, getQualityTierColor, getCarbonLevel } from '@/types'
import { Loader2, Radio } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export function DecisionStream() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['decisions', 50],
    queryFn: () => ecobeApi.getDecisions(50),
    refetchInterval: 15_000,
  })

  const decisions = data?.decisions ?? []

  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center space-x-2">
          <Radio className="w-4 h-4 text-emerald-400" />
          <h3 className="text-lg font-semibold text-white">Decision Stream</h3>
          {!isLoading && !isError && (
            <span className="text-xs text-slate-500">
              — {decisions.length} recent
            </span>
          )}
        </div>
        <div className="flex items-center space-x-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs text-slate-500">Live</span>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
        </div>
      )}

      {isError && (
        <div className="py-6 text-center">
          <p className="text-sm text-slate-500">Connect ECOBE Engine to stream decisions</p>
        </div>
      )}

      {!isLoading && decisions.length === 0 && !isError && (
        <div className="py-6 text-center">
          <p className="text-sm text-slate-500">No routing decisions yet</p>
        </div>
      )}

      <div className="space-y-2 max-h-96 overflow-y-auto pr-1 custom-scrollbar">
        {decisions.map((d) => {
          const chosenIntensity = d.carbonIntensityChosenGPerKwh
          const baselineIntensity = d.carbonIntensityBaselineGPerKwh
          const delta =
            chosenIntensity != null && baselineIntensity != null
              ? Math.round(baselineIntensity - chosenIntensity)
              : null

          // Derive quality tier from fallback + data freshness
          const tier =
            d.fallbackUsed
              ? 'low'
              : d.dataFreshnessSeconds != null && d.dataFreshnessSeconds > 600
                ? 'medium'
                : 'high'

          const level = chosenIntensity != null ? getCarbonLevel(chosenIntensity) : null

          return (
            <div
              key={d.id}
              className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition font-mono text-xs"
            >
              {/* Timestamp */}
              <div className="w-16 flex-shrink-0 text-slate-500 mt-0.5">
                {new Date(d.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                })}{' '}
                UTC
              </div>

              {/* Main info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {d.workloadName && (
                    <span className="text-slate-300">
                      Job: <span className="text-white">{d.workloadName}</span>
                    </span>
                  )}
                  <span className="text-slate-400">
                    {d.baselineRegion} → <span className="text-emerald-400 font-semibold">{d.chosenRegion}</span>
                  </span>
                  {chosenIntensity != null && (
                    <span
                      className={
                        level === 'low'
                          ? 'text-emerald-400'
                          : level === 'medium'
                            ? 'text-yellow-400'
                            : 'text-red-400'
                      }
                    >
                      {chosenIntensity} gCO₂/kWh
                    </span>
                  )}
                  {delta != null && delta > 0 && (
                    <span className="text-sky-400">Δ{delta}</span>
                  )}
                </div>
                {d.reason && (
                  <p className="text-slate-600 mt-0.5 truncate">{d.reason}</p>
                )}
              </div>

              {/* Badges */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <span
                  className={`px-1.5 py-0.5 rounded text-xs font-medium ${getQualityTierBadge(tier as 'high' | 'medium' | 'low')}`}
                >
                  {tier.toUpperCase()}
                </span>
                {d.fallbackUsed && (
                  <span className="px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/30 text-xs">
                    FALLBACK
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {decisions.length > 0 && (
        <p className="text-xs text-slate-600 mt-3 text-right">
          Last updated {formatDistanceToNow(new Date(decisions[0].createdAt))} ago
        </p>
      )}
    </div>
  )
}
