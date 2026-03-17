'use client'

import { useQuery } from '@tanstack/react-query'
import { ecobeApi } from '@/lib/api'
import { getCarbonLevel, getQualityTierBadge } from '@/types'
import { Loader2, RefreshCw } from 'lucide-react'

export function CarbonOpportunityMap() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['region-mapping'],
    queryFn: () => ecobeApi.getRegionMapping(),
    refetchInterval: 5 * 60_000,
  })

  const sorted = data?.mappings
    ?.filter((m) => m.carbonIntensityGPerKwh != null)
    ?.sort((a, b) => (a.carbonIntensityGPerKwh ?? 9999) - (b.carbonIntensityGPerKwh ?? 9999))

  const worst = sorted?.[sorted.length - 1]?.carbonIntensityGPerKwh ?? 0

  const getQualityFromIntensity = (intensity: number) => {
    const level = getCarbonLevel(intensity)
    if (level === 'low') return 'high' as const
    if (level === 'medium') return 'medium' as const
    return 'low' as const
  }

  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-lg font-semibold text-white">Carbon Opportunity Map</h3>
          <p className="text-xs text-slate-500 mt-0.5">Candidate regions ranked by signal quality</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 text-slate-400 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
        </div>
      )}

      {isError && (
        <p className="text-sm text-red-400 py-4">Failed to load region data</p>
      )}

      {sorted && sorted.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                <th className="pb-3 font-medium">#</th>
                <th className="pb-3 font-medium">Region</th>
                <th className="pb-3 font-medium">Zone</th>
                <th className="pb-3 font-medium text-right">gCO₂/kWh</th>
                <th className="pb-3 font-medium text-right">Delta vs Worst</th>
                <th className="pb-3 font-medium text-center">Quality</th>
                <th className="pb-3 font-medium text-right">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {sorted.map((m, idx) => {
                const intensity = m.carbonIntensityGPerKwh ?? 0
                const delta = Math.round(worst - intensity)
                const tier = getQualityFromIntensity(intensity)
                const isBest = idx === 0

                return (
                  <tr
                    key={m.cloudRegion}
                    className={`${isBest ? 'bg-emerald-500/5' : 'hover:bg-slate-800/30'} transition`}
                  >
                    <td className="py-3 pr-3">
                      {isBest ? (
                        <span className="text-xs font-bold text-emerald-400">★</span>
                      ) : (
                        <span className="text-xs text-slate-600">{idx + 1}</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 font-medium text-white">{m.cloudRegion}</td>
                    <td className="py-3 pr-4 text-slate-400 font-mono text-xs">{m.zone}</td>
                    <td className="py-3 pr-4 text-right">
                      <span
                        className={`font-semibold ${
                          tier === 'high'
                            ? 'text-emerald-400'
                            : tier === 'medium'
                              ? 'text-yellow-400'
                              : 'text-red-400'
                        }`}
                      >
                        {intensity}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right text-sky-400 font-medium">
                      {delta > 0 ? `+${delta}` : '—'}
                    </td>
                    <td className="py-3 pr-4 text-center">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${getQualityTierBadge(tier)}`}
                      >
                        {tier.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 text-right text-slate-500 text-xs">
                      {m.fetchedAt
                        ? new Date(m.fetchedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {data?.mappings?.length === 0 && (
        <div className="text-center py-8">
          <p className="text-sm text-slate-500">No region data available</p>
          <p className="text-xs text-slate-600 mt-1">Connect ECOBE Engine to populate</p>
        </div>
      )}
    </div>
  )
}
