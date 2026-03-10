'use client'

import { useQuery } from '@tanstack/react-query'
import { ecobeApi } from '@/lib/api'
import { Loader2, Wifi, WifiOff, AlertCircle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export function ProviderHealthMonitor() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['provider-health'],
    queryFn: () => ecobeApi.getProviderHealth(),
    refetchInterval: 30_000,
  })

  const { data: metrics } = useQuery({
    queryKey: ['dashboard-metrics', '24h'],
    queryFn: () => ecobeApi.getDashboardMetrics('24h'),
    refetchInterval: 30_000,
  })

  const disagreeRate =
    metrics?.electricityMaps?.successRate != null
      ? ((1 - metrics.electricityMaps.successRate) * 100).toFixed(1)
      : null

  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-white">Provider Health</h3>
        <p className="text-xs text-slate-500 mt-0.5">Signal validation layer</p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
        </div>
      )}

      {isError && (
        <div className="space-y-3">
          {/* Fallback: show Electricity Maps status from metrics */}
          {metrics?.electricityMaps && (
            <ProviderRow
              name="Electricity Maps"
              status={metrics.electricityMaps.successRate != null && metrics.electricityMaps.successRate > 0.8 ? 'healthy' : 'degraded'}
              latencyMs={metrics.p95LatencyDeltaMs}
              lastSuccessAt={metrics.electricityMaps.lastSuccessAt}
              disagreeRate={null}
            />
          )}
          <p className="text-xs text-slate-600">Additional provider data unavailable</p>
        </div>
      )}

      {data?.providers && (
        <div className="space-y-3">
          {data.providers.map((p) => (
            <ProviderRow
              key={p.name}
              name={p.name}
              status={p.status}
              latencyMs={p.latencyMs}
              lastSuccessAt={p.lastSuccessAt}
              disagreeRate={p.disagreementPct}
            />
          ))}
        </div>
      )}

      {/* Disagreement summary */}
      {disagreeRate != null && (
        <div className="border-t border-slate-800 pt-4">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Provider disagreement rate</span>
            <span
              className={
                parseFloat(disagreeRate) > 15 ? 'text-red-400 font-medium' : 'text-slate-300'
              }
            >
              {disagreeRate}%
            </span>
          </div>
          <div className="flex justify-between text-xs mt-2">
            <span className="text-slate-400">Signal successes (24h)</span>
            <span className="text-emerald-400">
              {metrics?.electricityMaps?.successCount ?? '—'}
            </span>
          </div>
          <div className="flex justify-between text-xs mt-2">
            <span className="text-slate-400">Signal failures (24h)</span>
            <span
              className={
                (metrics?.electricityMaps?.failureCount ?? 0) > 0
                  ? 'text-orange-400'
                  : 'text-slate-400'
              }
            >
              {metrics?.electricityMaps?.failureCount ?? '—'}
            </span>
          </div>
          {metrics?.electricityMaps?.lastError && (
            <div className="mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-xs text-red-400 font-mono truncate">
                {metrics.electricityMaps.lastError}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ProviderRow({
  name,
  status,
  latencyMs,
  lastSuccessAt,
  disagreeRate,
}: {
  name: string
  status: 'healthy' | 'degraded' | 'offline'
  latencyMs: number | null
  lastSuccessAt: string | null
  disagreeRate: number | null
}) {
  const statusConfig = {
    healthy: { icon: <Wifi className="w-4 h-4 text-emerald-400" />, label: 'healthy', color: 'text-emerald-400' },
    degraded: { icon: <AlertCircle className="w-4 h-4 text-yellow-400" />, label: 'degraded', color: 'text-yellow-400' },
    offline: { icon: <WifiOff className="w-4 h-4 text-red-400" />, label: 'offline', color: 'text-red-400' },
  }
  const cfg = statusConfig[status]

  return (
    <div className="flex items-center justify-between p-3 bg-slate-800/40 rounded-lg">
      <div className="flex items-center space-x-3">
        {cfg.icon}
        <div>
          <p className="text-sm font-medium text-white">{name}</p>
          {lastSuccessAt && (
            <p className="text-xs text-slate-500">
              last ok {formatDistanceToNow(new Date(lastSuccessAt))} ago
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs text-right">
        {latencyMs != null && (
          <div>
            <p className="text-slate-400">{latencyMs}ms</p>
            <p className="text-slate-600">latency</p>
          </div>
        )}
        {disagreeRate != null && (
          <div>
            <p className={disagreeRate > 15 ? 'text-red-400' : 'text-slate-400'}>
              {disagreeRate.toFixed(1)}%
            </p>
            <p className="text-slate-600">disagree</p>
          </div>
        )}
        <span className={`font-medium ${cfg.color}`}>{cfg.label}</span>
      </div>
    </div>
  )
}
