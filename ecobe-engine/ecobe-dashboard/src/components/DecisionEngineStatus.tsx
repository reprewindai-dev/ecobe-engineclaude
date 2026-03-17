'use client'

import { useQuery } from '@tanstack/react-query'
import { ecobeApi } from '@/lib/api'
import { getQualityTierColor } from '@/types'
import { Shield, Zap, TrendingDown, Activity, AlertTriangle, CheckCircle } from 'lucide-react'

export function DecisionEngineStatus() {
  const { data: metrics, isError: metricsError } = useQuery({
    queryKey: ['dashboard-metrics', '24h'],
    queryFn: () => ecobeApi.getDashboardMetrics('24h'),
    refetchInterval: 30_000,
  })

  const { data: health, isError: healthError } = useQuery({
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
    ?.filter((m) => m.carbonIntensityGPerKwh != null)
    ?.sort((a, b) => (a.carbonIntensityGPerKwh ?? 9999) - (b.carbonIntensityGPerKwh ?? 9999))

  const cleanest = sorted?.[0]
  const worst = sorted?.[sorted.length - 1]

  const carbonDelta =
    cleanest?.carbonIntensityGPerKwh != null && worst?.carbonIntensityGPerKwh != null
      ? Math.round(worst.carbonIntensityGPerKwh - cleanest.carbonIntensityGPerKwh)
      : null

  const disagreeRate =
    metrics?.electricityMaps?.successRate != null
      ? ((1 - metrics.electricityMaps.successRate) * 100).toFixed(1)
      : null

  const isOnline = !healthError && !metricsError

  // Derive overall quality tier from fallback rate
  const qualityLabel =
    metrics == null
      ? '—'
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
    <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <div
            className={`h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}
          />
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Decision Engine
          </span>
        </div>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded ${
            isOnline
              ? 'text-emerald-400 bg-emerald-500/10'
              : 'text-red-400 bg-red-500/10'
          }`}
        >
          {isOnline ? 'LIVE' : 'OFFLINE'}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatusMetric
          icon={<Shield className="w-3.5 h-3.5" />}
          label="Cleanest Region"
          value={cleanest?.cloudRegion ?? '—'}
          sub={cleanest?.zone}
          highlight
        />
        <StatusMetric
          icon={<Zap className="w-3.5 h-3.5" />}
          label="Carbon Intensity"
          value={cleanest?.carbonIntensityGPerKwh != null ? `${cleanest.carbonIntensityGPerKwh}` : '—'}
          sub="gCO₂/kWh"
          color="text-emerald-400"
        />
        <StatusMetric
          icon={<TrendingDown className="w-3.5 h-3.5" />}
          label="Carbon Delta"
          value={carbonDelta != null ? `+${carbonDelta}` : '—'}
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
          value={disagreeRate != null ? `${disagreeRate}%` : '—'}
          color={
            disagreeRate && parseFloat(disagreeRate) > 15 ? 'text-red-400' : 'text-slate-300'
          }
        />
        <StatusMetric
          icon={<Activity className="w-3.5 h-3.5" />}
          label="Decisions / 24h"
          value={metrics?.totalDecisions?.toLocaleString() ?? '—'}
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
      className={`rounded-lg p-3 ${
        highlight
          ? 'bg-emerald-500/5 border border-emerald-500/20'
          : 'bg-slate-800/40'
      }`}
    >
      <div className={`flex items-center space-x-1 mb-1 ${color ?? 'text-slate-400'}`}>
        {icon}
        <span className="text-xs truncate">{label}</span>
      </div>
      <p className={`text-base font-bold truncate ${color ?? 'text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5 truncate">{sub}</p>}
    </div>
  )
}
