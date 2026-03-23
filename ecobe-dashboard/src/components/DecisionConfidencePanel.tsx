'use client'

import { useQuery } from '@tanstack/react-query'
import { ecobeApi } from '@/lib/api'
import { Loader2 } from 'lucide-react'
import { deriveQualityTier } from '@/lib/decisions'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

export function DecisionConfidencePanel() {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['dashboard-metrics', '24h'],
    queryFn: () => ecobeApi.getDashboardMetrics('24h'),
    refetchInterval: 60_000,
  })

  const { data: decisionsData } = useQuery({
    queryKey: ['decisions', 100],
    queryFn: () => ecobeApi.getDecisions(100),
    refetchInterval: 60_000,
  })

  // Derive tier distribution using the shared utility — keeps thresholds consistent
  // with DecisionStream, DekesImpactCard, IntegrationSourcesPanel, and the timeline.
  const decisions = decisionsData?.decisions ?? []
  const high = decisions.filter((d) => deriveQualityTier(d) === 'high').length
  const low = decisions.filter((d) => deriveQualityTier(d) === 'low').length
  const medium = decisions.filter((d) => deriveQualityTier(d) === 'medium').length

  const total = decisions.length || 1

  const chartData = [
    {
      tier: 'HIGH',
      count: high,
      pct: +((high / total) * 100).toFixed(1),
      color: '#10b981',
    },
    {
      tier: 'MEDIUM',
      count: medium,
      pct: +((medium / total) * 100).toFixed(1),
      color: '#f59e0b',
    },
    {
      tier: 'LOW',
      count: low,
      pct: +((low / total) * 100).toFixed(1),
      color: '#ef4444',
    },
  ]

  // Provider events from metrics
  const providerErrors = metrics?.electricityMaps?.failureCount ?? 0
  const fallbackRate = metrics ? (metrics.fallbackRate * 100).toFixed(1) : null
  const greenRate = metrics ? (metrics.greenRouteRate * 100).toFixed(1) : null

  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-white">Decision Confidence</h3>
        <p className="text-xs text-slate-500 mt-0.5">System reliability breakdown</p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
        </div>
      )}

      {decisions.length > 0 && (
        <>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="tier"
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                formatter={(val: number, name: string) => [`${val}%`, 'Share']}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell key={entry.tier} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div className="grid grid-cols-3 gap-3">
            {chartData.map((c) => (
              <div key={c.tier} className="bg-slate-800/40 rounded-lg p-3 text-center">
                <p className="text-xl font-bold" style={{ color: c.color }}>
                  {c.pct}%
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{c.tier}</p>
                <p className="text-xs text-slate-600">{c.count} decisions</p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Engine stats from metrics */}
      <div className="border-t border-slate-800 pt-4 space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-slate-400">Green route rate</span>
          <span className="text-emerald-400 font-medium">
            {greenRate != null ? `${greenRate}%` : '—'}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-400">Fallback rate</span>
          <span
            className={
              fallbackRate && parseFloat(fallbackRate) > 20 ? 'text-red-400' : 'text-slate-300'
            }
          >
            {fallbackRate != null ? `${fallbackRate}%` : '—'}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-400">Provider errors</span>
          <span className={providerErrors > 0 ? 'text-orange-400' : 'text-slate-300'}>
            {metrics ? providerErrors : '—'}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-400">Top chosen region</span>
          <span className="text-white font-medium font-mono">
            {metrics?.topChosenRegion ?? '—'}
          </span>
        </div>
      </div>
    </div>
  )
}
