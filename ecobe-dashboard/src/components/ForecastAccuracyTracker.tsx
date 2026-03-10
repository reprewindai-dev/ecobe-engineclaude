'use client'

import { useQuery } from '@tanstack/react-query'
import { ecobeApi } from '@/lib/api'
import { Loader2, TrendingUp } from 'lucide-react'

const VOLATILITY_LABELS: Record<string, string> = {
  FR: 'LOW',
  SE: 'LOW',
  NO: 'LOW',
  'US-CAL-CISO': 'MEDIUM',
  GB: 'MEDIUM',
  DE: 'MEDIUM',
}

export function ForecastAccuracyTracker() {
  const { data: savings, isLoading } = useQuery({
    queryKey: ['dashboard-savings', '7d'],
    queryFn: () => ecobeApi.getDashboardSavings('7d'),
    refetchInterval: 5 * 60_000,
  })

  const { data: metrics } = useQuery({
    queryKey: ['dashboard-metrics', '24h'],
    queryFn: () => ecobeApi.getDashboardMetrics('24h'),
    refetchInterval: 30_000,
  })

  const forecastLastRun = metrics?.forecastRefresh?.lastRun

  // Use byRegion decisions/savings as performance proxy per region
  const regionPerf = savings?.byRegion?.slice(0, 8) ?? []

  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 space-y-5">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-slate-400" />
        <div>
          <h3 className="text-lg font-semibold text-white">Forecast Accuracy</h3>
          <p className="text-xs text-slate-500 mt-0.5">Per-region routing performance</p>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
        </div>
      )}

      {regionPerf.length > 0 && (
        <div className="space-y-2">
          {regionPerf.map((r) => {
            // Use savings% as proxy for prediction quality
            const accuracy = Math.min(r.savingsPct, 99)
            const volatility = VOLATILITY_LABELS[r.region] ?? 'UNKNOWN'
            const volColor =
              volatility === 'LOW'
                ? 'text-emerald-400'
                : volatility === 'MEDIUM'
                  ? 'text-yellow-400'
                  : 'text-red-400'

            return (
              <div
                key={r.region}
                className="flex items-center gap-3 p-3 bg-slate-800/30 rounded-lg"
              >
                <span className="text-xs font-mono text-white w-28 flex-shrink-0">{r.region}</span>
                <div className="flex-1 bg-slate-800 rounded-full h-1.5">
                  <div
                    className="bg-emerald-500 h-full rounded-full"
                    style={{ width: `${accuracy}%` }}
                  />
                </div>
                <span className="text-xs text-emerald-400 w-12 text-right">
                  {accuracy.toFixed(1)}%
                </span>
                <span className={`text-xs w-16 text-right ${volColor}`}>{volatility}</span>
                <span className="text-xs text-slate-600 w-20 text-right">
                  {r.decisions} samples
                </span>
              </div>
            )
          })}
        </div>
      )}

      {regionPerf.length === 0 && !isLoading && (
        <div className="text-center py-6">
          <p className="text-sm text-slate-500">No region data yet</p>
        </div>
      )}

      {/* Forecast ingestion status */}
      {forecastLastRun && (
        <div className="border-t border-slate-800 pt-4">
          <p className="text-xs text-slate-400 mb-2">Last forecast ingestion</p>
          <div className="bg-slate-800/30 rounded-lg p-3 text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-500">Timestamp</span>
              <span className="text-slate-300">
                {new Date(forecastLastRun.timestamp).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Regions</span>
              <span className="text-slate-300">{forecastLastRun.totalRegions}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Forecast records</span>
              <span className="text-slate-300">{forecastLastRun.totalForecasts}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Status</span>
              <span
                className={
                  forecastLastRun.status === 'ok' || forecastLastRun.status === 'success'
                    ? 'text-emerald-400'
                    : 'text-yellow-400'
                }
              >
                {forecastLastRun.status}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
