'use client'

import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Shield,
  TrendingDown,
  Zap,
} from 'lucide-react'

import { ecobeApi } from '@/lib/api'
import { getQualityTierColor } from '@/types'

export function DecisionEngineStatus() {
  const { data: metrics, isError: metricsError } = useQuery({
    queryKey: ['dashboard-metrics', '24h'],
    queryFn: () => ecobeApi.getDashboardMetrics('24h'),
    refetchInterval: 30_000,
  })

  const { isError: healthError } = useQuery({
    queryKey: ['health'],
    queryFn: () => ecobeApi.health(),
    refetchInterval: 30_000,
  })

  const { data: mappingData } = useQuery({
    queryKey: ['region-mapping'],
    queryFn: () => ecobeApi.getRegionMapping(),
    refetchInterval: 5 * 60_000,
  })

  const sorted = mappingData?.mappings
    ?.filter((mapping) => mapping.carbonIntensityGPerKwh != null)
    ?.sort((a, b) => (a.carbonIntensityGPerKwh ?? 9999) - (b.carbonIntensityGPerKwh ?? 9999))

  const cleanest = sorted?.[0]
  const worst = sorted?.[sorted.length - 1]

  const carbonDelta =
    cleanest?.carbonIntensityGPerKwh != null && worst?.carbonIntensityGPerKwh != null
      ? Math.round(worst.carbonIntensityGPerKwh - cleanest.carbonIntensityGPerKwh)
      : null

  const disagreeRate =
    metrics?.providerSignals?.successRate != null
      ? ((1 - metrics.providerSignals.successRate) * 100).toFixed(1)
      : null

  const isOnline = !healthError && !metricsError

  const qualityLabel =
    metrics == null
      ? '-'
      : metrics.fallbackRate < 0.05
        ? 'HIGH'
        : metrics.fallbackRate < 0.2
          ? 'MEDIUM'
          : 'LOW'

  const qualityTier =
    metrics == null
      ? null
      : metrics.fallbackRate < 0.05
        ? ('high' as const)
        : metrics.fallbackRate < 0.2
          ? ('medium' as const)
          : ('low' as const)

  return (
    <div className="glass-card rounded-2xl p-5 relative overflow-hidden">
      {/* Subtle gradient overlay */}
      {isOnline && (
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className={`h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-500 pulse-glow' : 'bg-red-500'}`} />
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em]">
            Decision Engine
          </span>
        </div>
        <span
          className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
            isOnline
              ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
              : 'text-red-400 bg-red-500/10 border border-red-500/20'
          }`}
        >
          {isOnline ? 'LIVE' : 'OFFLINE'}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatusMetric
          icon={<Shield className="w-3.5 h-3.5" />}
          label="Cleanest Region"
          value={cleanest?.cloudRegion ?? '-'}
          sub={cleanest?.zone}
          highlight
        />
        <StatusMetric
          icon={<Zap className="w-3.5 h-3.5" />}
          label="Carbon Intensity"
          value={cleanest?.carbonIntensityGPerKwh != null ? `${cleanest.carbonIntensityGPerKwh}` : '-'}
          sub="gCO₂/kWh"
          color="text-emerald-400"
        />
        <StatusMetric
          icon={<TrendingDown className="w-3.5 h-3.5" />}
          label="Carbon Delta"
          value={carbonDelta != null ? `+${carbonDelta}` : '-'}
          sub="vs worst candidate"
          color="text-sky-400"
        />
        <StatusMetric
          icon={<CheckCircle className="w-3.5 h-3.5" />}
          label="Decision Quality"
          value={qualityLabel}
          color={qualityTier ? getQualityTierColor(qualityTier) : 'text-slate-400'}
        />
        <StatusMetric
          icon={<AlertTriangle className="w-3.5 h-3.5" />}
          label="Provider Disagree"
          value={disagreeRate != null ? `${disagreeRate}%` : '-'}
          color={disagreeRate && parseFloat(disagreeRate) > 15 ? 'text-red-400' : 'text-slate-300'}
        />
        <StatusMetric
          icon={<Activity className="w-3.5 h-3.5" />}
          label="Decisions / 24h"
          value={metrics?.totalDecisions?.toLocaleString() ?? '-'}
        />
      </div>
    </div>
  )
}

function StatusMetric({
  icon,
  label,
  value,
  sub,
  color,
  highlight,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  color?: string
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-xl p-3 transition-all duration-200 hover-lift ${
        highlight
          ? 'bg-emerald-500/5 border border-emerald-500/15'
          : 'bg-slate-800/20 border border-slate-700/20 hover:border-slate-600/30'
      }`}
    >
      <div className={`flex items-center gap-1.5 mb-1.5 ${color ?? 'text-slate-400'}`}>
        {icon}
        <span className="text-[10px] font-medium truncate uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-lg font-bold truncate ${color ?? 'text-white'}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-600 mt-0.5 truncate">{sub}</p>}
    </div>
  )
}
