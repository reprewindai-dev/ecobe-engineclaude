'use client'

import { useQuery } from '@tanstack/react-query'
import { ecobeApi } from '@/lib/api'
import { ShieldCheck, Loader2, RefreshCw, ArrowRight, Clock, AlertTriangle } from 'lucide-react'

export function ExecutionIntegrityPanel() {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['dashboard-metrics', '24h'],
    queryFn: () => ecobeApi.getDashboardMetrics('24h'),
    refetchInterval: 30_000,
  })

  const integrity = metrics?.executionIntegrity

  // No data from engine yet
  if (!isLoading && !integrity) return null

  const driftPct = integrity?.driftPreventedPct ?? null
  const isStrong = driftPct != null && driftPct >= 90
  const isWeak = driftPct != null && driftPct < 70

  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 space-y-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-emerald-400" />
        <div>
          <h3 className="text-lg font-semibold text-white">Execution Integrity</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            How often routing decisions hold through to execution
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
        </div>
      )}

      {integrity && (
        <>
          {/* Hero: drift prevented % */}
          <div
            className={`rounded-lg p-4 border ${
              isStrong
                ? 'bg-emerald-500/5 border-emerald-500/20'
                : isWeak
                  ? 'bg-red-500/5 border-red-500/20'
                  : 'bg-yellow-500/5 border-yellow-500/20'
            }`}
          >
            <p className="text-xs text-slate-400 mb-1">Drift Prevented</p>
            <div className="flex items-baseline gap-2">
              <span
                className={`text-4xl font-black ${
                  isStrong ? 'text-emerald-400' : isWeak ? 'text-red-400' : 'text-yellow-400'
                }`}
              >
                {driftPct?.toFixed(1) ?? '—'}%
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Decisions that executed in the region they were routed to
            </p>

            {/* Progress bar */}
            {driftPct != null && (
              <div className="mt-3 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isStrong ? 'bg-emerald-500' : isWeak ? 'bg-red-500' : 'bg-yellow-500'
                  }`}
                  style={{ width: `${driftPct}%` }}
                />
              </div>
            )}
          </div>

          {/* Detail row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <IntegrityMetric
              icon={<RefreshCw className="w-3.5 h-3.5 text-sky-400" />}
              label="Revalidations"
              value={integrity.revalidationsTriggered.toLocaleString()}
              color="text-sky-400"
            />
            <IntegrityMetric
              icon={<ArrowRight className="w-3.5 h-3.5 text-yellow-400" />}
              label="Rerouted"
              value={integrity.reroutedCount.toLocaleString()}
              color="text-yellow-400"
              highlight={integrity.reroutedCount > 0}
            />
            <IntegrityMetric
              icon={<Clock className="w-3.5 h-3.5 text-orange-400" />}
              label="Delayed"
              value={integrity.delayedCount.toLocaleString()}
              color="text-orange-400"
              highlight={integrity.delayedCount > 0}
            />
            <IntegrityMetric
              icon={<AlertTriangle className="w-3.5 h-3.5 text-red-400" />}
              label="Staleness violations"
              value={integrity.stalenessViolations.toLocaleString()}
              color="text-red-400"
              highlight={integrity.stalenessViolations > 0}
            />
          </div>

          {/* Staleness warning */}
          {integrity.stalenessViolations > 0 && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-400 font-medium">
                  {integrity.stalenessViolations} staleness{' '}
                  {integrity.stalenessViolations === 1 ? 'violation' : 'violations'} detected
                </p>
                <p className="text-red-300/60 mt-0.5">
                  Workloads executed after lease_expires_at — check revalidation flow
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function IntegrityMetric({
  icon,
  label,
  value,
  color,
  highlight,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: string
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-lg p-3 ${
        highlight ? 'bg-slate-800/60 ring-1 ring-yellow-500/20' : 'bg-slate-800/40'
      }`}
    >
      <div className={`flex items-center gap-1.5 mb-1 ${color}`}>{icon}</div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  )
}
