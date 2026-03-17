'use client'

import { useQuery } from '@tanstack/react-query'
import { ecobeApi } from '@/lib/api'
import { Plug, Loader2 } from 'lucide-react'
import type { DashboardDecision } from '@/types'
import { getDecisionSource, isDecisionDelayed } from '@/lib/decisions'

interface SourceStats {
  source: string
  decisions: number
  avgCarbonDelta: number
  delayRate: number
  delayedCount: number
}

function computeSourceStats(decisions: DashboardDecision[]): SourceStats[] {
  const map = new Map<string, { deltas: number[]; delayed: number; total: number }>()

  for (const d of decisions) {
    const source = getDecisionSource(d)
    if (!map.has(source)) map.set(source, { deltas: [], delayed: 0, total: 0 })
    const entry = map.get(source)!
    entry.total++
    const delta =
      d.carbonIntensityBaselineGPerKwh != null && d.carbonIntensityChosenGPerKwh != null
        ? d.carbonIntensityBaselineGPerKwh - d.carbonIntensityChosenGPerKwh
        : null
    if (delta != null) entry.deltas.push(delta)
    if (isDecisionDelayed(d)) entry.delayed++
  }

  return Array.from(map.entries())
    .map(([source, s]) => ({
      source,
      decisions: s.total,
      avgCarbonDelta: s.deltas.length > 0 ? s.deltas.reduce((a, b) => a + b, 0) / s.deltas.length : 0,
      delayRate: s.total > 0 ? (s.delayed / s.total) * 100 : 0,
      delayedCount: s.delayed,
    }))
    .sort((a, b) => b.decisions - a.decisions)
}

export function IntegrationSourcesPanel() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['decisions', 500],
    queryFn: () => ecobeApi.getDecisions(500),
    refetchInterval: 60_000,
  })

  const decisions = data?.decisions ?? []
  const sources = computeSourceStats(decisions)

  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Plug className="w-5 h-5 text-emerald-400" />
        <div>
          <h3 className="text-lg font-semibold text-white">Integration Sources</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            All workload sources routing through ECOBE — read from decision log
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
        </div>
      )}

      {isError && (
        <p className="text-sm text-slate-500 py-4 text-center">
          Connect ECOBE Engine to view integration sources
        </p>
      )}

      {!isLoading && sources.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                <th className="pb-3 font-medium">Source</th>
                <th className="pb-3 font-medium text-right">Decisions</th>
                <th className="pb-3 font-medium text-right">Avg Carbon Delta</th>
                <th className="pb-3 font-medium text-right">Delay Rate</th>
                <th className="pb-3 font-medium text-right">Policy Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {sources.map((s) => (
                <tr key={s.source} className="hover:bg-slate-800/20 transition">
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      {s.source === 'DEKES' && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          DEKES
                        </span>
                      )}
                      {s.source !== 'DEKES' && (
                        <span className="text-slate-300 font-medium">{s.source}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 text-right font-mono text-white">
                    {s.decisions.toLocaleString()}
                  </td>
                  <td className="py-3 text-right font-mono">
                    <span className={s.avgCarbonDelta > 0 ? 'text-emerald-400' : 'text-slate-400'}>
                      {s.avgCarbonDelta > 0 ? '+' : ''}
                      {s.avgCarbonDelta.toFixed(0)} g/kWh
                    </span>
                  </td>
                  <td className="py-3 text-right font-mono">
                    <span
                      className={
                        s.delayRate > 20
                          ? 'text-red-400'
                          : s.delayRate > 10
                            ? 'text-yellow-400'
                            : 'text-slate-400'
                      }
                    >
                      {s.delayRate.toFixed(0)}%
                    </span>
                  </td>
                  <td className="py-3 text-right font-mono text-slate-400">
                    {s.delayedCount > 0 ? (
                      <span className="text-yellow-400">{s.delayedCount} delayed</span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && !isError && decisions.length > 0 && (
        <p className="text-xs text-slate-600 text-right">
          {decisions.length} decisions analysed · Data from ECOBE decision log
        </p>
      )}
    </div>
  )
}
