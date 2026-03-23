'use client'

import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { AlertCircle, Loader2, Wifi, WifiOff } from 'lucide-react'

import { ecobeApi } from '@/lib/api'

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
    metrics?.providerSignals?.successRate != null
      ? ((1 - metrics.providerSignals.successRate) * 100).toFixed(1)
      : null

  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-white">Provider Health</h3>
        <p className="text-xs text-slate-500 mt-0.5">Live signal provider mesh</p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
        </div>
      )}

      {isError && (
        <div className="space-y-3">
          {metrics?.providerSignals && (
            <ProviderRow
              name="Live Signal Mesh"
              status={
                metrics.providerSignals.successRate != null &&
                metrics.providerSignals.successRate > 0.8
                  ? 'healthy'
                  : 'degraded'
              }
              latencyMs={metrics.p95LatencyDeltaMs}
              lastSuccessAt={metrics.providerSignals.lastSuccessAt}
              disagreeRate={null}
            />
          )}
          <p className="text-xs text-slate-600">Additional provider details unavailable</p>
        </div>
      )}

      {data?.providers && (
        <div className="space-y-3">
          {data.providers.map((provider) => (
            <ProviderRow
              key={provider.name}
              name={provider.name}
              status={provider.status}
              latencyMs={provider.latencyMs}
              lastSuccessAt={provider.lastSuccessAt}
              disagreeRate={provider.disagreementPct}
            />
          ))}
        </div>
      )}

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
              {metrics?.providerSignals?.successCount ?? '-'}
            </span>
          </div>
          <div className="flex justify-between text-xs mt-2">
            <span className="text-slate-400">Signal failures (24h)</span>
            <span
              className={
                (metrics?.providerSignals?.failureCount ?? 0) > 0
                  ? 'text-orange-400'
                  : 'text-slate-400'
              }
            >
              {metrics?.providerSignals?.failureCount ?? '-'}
            </span>
          </div>
          {metrics?.providerSignals?.lastError && (
            <div className="mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-xs text-red-400 font-mono truncate">
                {metrics.providerSignals.lastError}
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
    healthy: {
      icon: <Wifi className="w-4 h-4 text-emerald-400" />,
      label: 'healthy',
      color: 'text-emerald-400',
    },
    degraded: {
      icon: <AlertCircle className="w-4 h-4 text-yellow-400" />,
      label: 'degraded',
      color: 'text-yellow-400',
    },
    offline: {
      icon: <WifiOff className="w-4 h-4 text-red-400" />,
      label: 'offline',
      color: 'text-red-400',
    },
  }

  const config = statusConfig[status]

  return (
    <div className="flex items-center justify-between p-3 bg-slate-800/40 rounded-lg">
      <div className="flex items-center space-x-3">
        {config.icon}
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
        <span className={`font-medium ${config.color}`}>{config.label}</span>
      </div>
    </div>
  )
}
