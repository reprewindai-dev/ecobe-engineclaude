'use client'

import { useQuery } from '@tanstack/react-query'
import { ecobeApi } from '@/lib/api'
import { Loader2, Activity, Zap, Database, Clock } from 'lucide-react'

export function SystemHealth() {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['dashboard-metrics', '24h'],
    queryFn: () => ecobeApi.getDashboardMetrics('24h'),
    refetchInterval: 30_000,
  })

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => ecobeApi.health(),
    refetchInterval: 30_000,
  })

  const decisionsPerMin =
    metrics?.totalDecisions != null && metrics.windowHours > 0
      ? (metrics.totalDecisions / (metrics.windowHours * 60)).toFixed(1)
      : null

  const cacheHit =
    metrics?.electricityMaps?.successRate != null
      ? (metrics.electricityMaps.successRate * 100).toFixed(1)
      : null

  const p95Latency = metrics?.p95LatencyDeltaMs ?? null
  const dataFreshness = metrics?.dataFreshnessMaxSeconds ?? null

  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Activity className="w-5 h-5 text-slate-400" />
        <div>
          <h3 className="text-lg font-semibold text-white">System Health</h3>
          <p className="text-xs text-slate-500 mt-0.5">Infrastructure metrics</p>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          icon={<Zap className="w-4 h-4 text-sky-400" />}
          label="Decisions / min"
          value={decisionsPerMin ?? '—'}
          sub="24h average"
          color="text-sky-400"
        />
        <MetricCard
          icon={<Database className="w-4 h-4 text-teal-400" />}
          label="Signal success rate"
          value={cacheHit != null ? `${cacheHit}%` : '—'}
          sub="Electricity Maps"
          color="text-teal-400"
        />
        <MetricCard
          icon={<Clock className="w-4 h-4 text-purple-400" />}
          label="p95 Latency delta"
          value={p95Latency != null ? `${p95Latency}ms` : '—'}
          sub="routing overhead"
          color="text-purple-400"
        />
        <MetricCard
          icon={<Activity className="w-4 h-4 text-orange-400" />}
          label="Max data freshness"
          value={dataFreshness != null ? `${dataFreshness}s` : '—'}
          sub="oldest signal"
          color={
            dataFreshness != null && dataFreshness > 600 ? 'text-red-400' : 'text-orange-400'
          }
        />
      </div>

      {/* Additional stats */}
      {metrics && (
        <div className="border-t border-slate-800 pt-4 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Total requests (24h)</span>
            <span className="text-white">{metrics.totalRequests?.toLocaleString() ?? '—'}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">CO₂ avoided / 1k requests</span>
            <span className="text-emerald-400">
              {metrics.co2AvoidedPer1kRequestsG != null
                ? `${metrics.co2AvoidedPer1kRequestsG.toFixed(1)} g`
                : '—'}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Green route rate</span>
            <span className="text-emerald-400">
              {metrics.greenRouteRate != null
                ? `${(metrics.greenRouteRate * 100).toFixed(1)}%`
                : '—'}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Provider errors (24h)</span>
            <span
              className={
                (metrics.electricityMaps?.failureCount ?? 0) > 0
                  ? 'text-orange-400'
                  : 'text-slate-500'
              }
            >
              {metrics.electricityMaps?.failureCount ?? 0}
            </span>
          </div>
        </div>
      )}

      {/* Forecast refresh */}
      {metrics?.forecastRefresh?.lastRun && (
        <div className="border-t border-slate-800 pt-4">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Forecast ingestion</span>
            <span
              className={
                metrics.forecastRefresh.lastRun.status === 'ok' ||
                metrics.forecastRefresh.lastRun.status === 'success'
                  ? 'text-emerald-400'
                  : 'text-yellow-400'
              }
            >
              {metrics.forecastRefresh.lastRun.status}
            </span>
          </div>
          <div className="flex justify-between text-xs mt-2">
            <span className="text-slate-400">Regions in system</span>
            <span className="text-white">{metrics.forecastRefresh.lastRun.totalRegions}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function MetricCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  color: string
}) {
  return (
    <div className="bg-slate-800/40 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-slate-600 mt-0.5">{sub}</p>
    </div>
  )
}
