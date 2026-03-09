'use client'

import { useQuery } from '@tanstack/react-query'
import { ecobeApi } from '@/lib/api'
import { Shield, Clock, ArrowRight, Loader2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { isDecisionDelayed } from '@/lib/decisions'

export function PolicyEnforcementPanel() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['decisions', 100],
    queryFn: () => ecobeApi.getDecisions(100),
    refetchInterval: 30_000,
  })

  const decisions = data?.decisions ?? []

  // Policy-relevant events: use shared utility so definition matches all other DEKES surfaces.
  // Also catch explicit policy-reason text as a secondary signal.
  const policyEvents = decisions.filter(
    (d) =>
      isDecisionDelayed(d) ||
      (d.reason && d.reason.toLowerCase().includes('policy'))
  )

  // "delayed" = reason explicitly mentions delay OR signal was stale/fallback
  const delayed = decisions.filter(
    (d) =>
      isDecisionDelayed(d) ||
      (d.reason && d.reason.toLowerCase().includes('delay'))
  )
  const rerouted = decisions.filter(
    (d) =>
      d.baselineRegion !== d.chosenRegion &&
      !d.fallbackUsed
  )
  const fallbacks = decisions.filter((d) => d.fallbackUsed)

  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 space-y-5">
      <div className="flex items-center space-x-2">
        <Shield className="w-5 h-5 text-slate-400" />
        <div>
          <h3 className="text-lg font-semibold text-white">Policy Enforcement</h3>
          <p className="text-xs text-slate-500 mt-0.5">Carbon policy actions</p>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
        </div>
      )}

      {/* Summary stats */}
      {!isLoading && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-800/40 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-yellow-400">{delayed.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">Jobs delayed</p>
          </div>
          <div className="bg-slate-800/40 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-sky-400">{rerouted.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">Jobs rerouted</p>
          </div>
          <div className="bg-slate-800/40 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-orange-400">{fallbacks.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">Fallback events</p>
          </div>
        </div>
      )}

      {/* Policy event log */}
      {policyEvents.length > 0 && (
        <div>
          <p className="text-xs text-slate-400 mb-2">Recent policy actions</p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {policyEvents.slice(0, 10).map((d) => {
              const isDelayed = isDecisionDelayed(d) || d.reason?.toLowerCase().includes('delay')
              const isRerouted = d.baselineRegion !== d.chosenRegion && !d.fallbackUsed
              const isFallback = d.fallbackUsed

              return (
                <div
                  key={d.id}
                  className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/50 font-mono text-xs"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    {isDelayed && (
                      <span className="flex items-center gap-1 text-yellow-400">
                        <Clock className="w-3 h-3" /> delayed
                      </span>
                    )}
                    {isRerouted && (
                      <span className="flex items-center gap-1 text-sky-400">
                        <ArrowRight className="w-3 h-3" /> rerouted
                      </span>
                    )}
                    {isFallback && (
                      <span className="text-orange-400">fallback</span>
                    )}
                    <span className="text-slate-600 ml-auto">
                      {formatDistanceToNow(new Date(d.createdAt))} ago
                    </span>
                  </div>

                  <div className="text-slate-300">
                    {d.workloadName && (
                      <span>
                        Job: <span className="text-white">{d.workloadName}</span>{' '}
                      </span>
                    )}
                    <span className="text-slate-400">
                      {d.baselineRegion}
                      {d.baselineRegion !== d.chosenRegion && (
                        <>
                          {' '}
                          <ArrowRight className="w-3 h-3 inline" />{' '}
                          <span className="text-emerald-400">{d.chosenRegion}</span>
                        </>
                      )}
                    </span>
                  </div>

                  {d.carbonIntensityBaselineGPerKwh != null &&
                    d.carbonIntensityChosenGPerKwh != null && (
                      <div className="text-slate-500 mt-0.5">
                        {d.carbonIntensityBaselineGPerKwh} →{' '}
                        <span className="text-emerald-400">
                          {d.carbonIntensityChosenGPerKwh} gCO₂/kWh
                        </span>
                      </div>
                    )}

                  {d.reason && (
                    <div className="text-slate-600 mt-0.5 truncate">{d.reason}</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {policyEvents.length === 0 && !isLoading && !isError && (
        <div className="text-center py-6">
          <Shield className="w-8 h-8 text-slate-700 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No policy events</p>
          <p className="text-xs text-slate-600 mt-1">All routing within policy</p>
        </div>
      )}
    </div>
  )
}
