'use client'

import { useQuery } from '@tanstack/react-query'
import { getCarbonLevel, getCarbonColor, getCarbonBgColor } from '@/types'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { ecobeApi } from '@/lib/api'

interface Props {
  region: {
    code: string
    name: string
  }
}

export function CarbonIntensityCard({ region }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['carbon-intensity', region.code],
    queryFn: async () => {
      try {
        const summary = await ecobeApi.getGridSummary()
        const match = summary.regions?.find(
          (r: any) => r.region === region.code || r.region === region.name
        )
        if (match) {
          return {
            region: region.code,
            carbonIntensity: Math.round(match.carbonIntensity ?? 0),
            timestamp: summary.timestamp || new Date().toISOString(),
            source: match.source ?? null,
          }
        }
      } catch { /* fall through */ }
      return {
        region: region.code,
        carbonIntensity: null as number | null,
        timestamp: new Date().toISOString(),
        source: null,
      }
    },
    refetchInterval: 5 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-6 animate-pulse">
        <div className="h-4 bg-slate-800 rounded w-24 mb-4" />
        <div className="h-8 bg-slate-800 rounded w-32" />
      </div>
    )
  }

  if (isError || !data || data.carbonIntensity === null) {
    return (
      <div className="bg-slate-900/50 rounded-lg border border-slate-800/50 p-6">
        <p className="text-sm text-slate-400">{region.name}</p>
        <p className="text-xs text-slate-500 mt-1">{region.code}</p>
        <p className="text-sm text-slate-500 mt-3">No data available</p>
      </div>
    )
  }

  const level = getCarbonLevel(data.carbonIntensity)
  const colorClass = getCarbonColor(level)
  const bgColorClass = getCarbonBgColor(level)

  return (
    <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-6 hover:border-slate-700 transition">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-slate-400">{region.name}</p>
          <p className="text-xs text-slate-500 mt-1">{region.code}</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline space-x-2">
          <p className={`text-3xl font-bold ${colorClass}`}>{data.carbonIntensity}</p>
          <p className="text-sm text-slate-500">gCO₂/kWh</p>
        </div>

        <div className="flex items-center space-x-2">
          <div className={`h-2 flex-1 rounded-full bg-slate-800`}>
            <div
              className={`h-full rounded-full ${bgColorClass}`}
              style={{
                width: `${Math.min((data.carbonIntensity / 600) * 100, 100)}%`,
              }}
            />
          </div>
        </div>

        <p className="text-xs text-slate-500">
          {level === 'low' && 'Excellent time for workloads'}
          {level === 'medium' && 'Moderate carbon intensity'}
          {level === 'high' && 'High carbon - consider delay'}
        </p>
      </div>

      <div className="mt-4 pt-4 border-t border-slate-800 flex justify-between">
        <p className="text-xs text-slate-500">
          Updated: {new Date(data.timestamp).toLocaleTimeString()}
        </p>
        {data.source && (
          <p className="text-xs text-slate-600">{data.source}</p>
        )}
      </div>
    </div>
  )
}
