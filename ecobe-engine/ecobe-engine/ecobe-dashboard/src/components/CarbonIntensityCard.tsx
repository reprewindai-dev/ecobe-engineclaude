'use client'

import { useQuery } from '@tanstack/react-query'
import { getCarbonLevel, getCarbonColor, getCarbonBgColor } from '@/types'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface Props {
  region: {
    code: string
    name: string
  }
}

export function CarbonIntensityCard({ region }: Props) {
  // Mock data - in production this would call actual API
  const { data, isLoading, isError } = useQuery({
    queryKey: ['carbon-intensity', region.code],
    queryFn: async () => {
      // Simulate API call with mock data
      // In production: return await electricityMapsClient.getCarbonIntensity(region.code)
      const mockIntensities: Record<string, number> = {
        'US-CAL-CISO': 180,
        FR: 58,
        DE: 320,
        GB: 240,
        SE: 45,
        NO: 28,
      }
      return {
        region: region.code,
        carbonIntensity: mockIntensities[region.code] || 200,
        timestamp: new Date().toISOString(),
      }
    },
    refetchInterval: 5 * 60 * 1000, // 5 minutes
  })

  if (isLoading) {
    return (
      <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-6 animate-pulse">
        <div className="h-4 bg-slate-800 rounded w-24 mb-4" />
        <div className="h-8 bg-slate-800 rounded w-32" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="bg-slate-900/50 rounded-lg border border-red-500/20 p-6">
        <p className="text-sm text-red-400">Error loading data</p>
      </div>
    )
  }

  const level = getCarbonLevel(data.carbonIntensity)
  const colorClass = getCarbonColor(level)
  const bgColorClass = getCarbonBgColor(level)

  const getTrendIcon = () => {
    // Mock trend - in production, compare with previous reading
    const trend = Math.random() > 0.5 ? 'up' : 'down'
    if (trend === 'up') return <TrendingUp className="w-4 h-4" />
    if (trend === 'down') return <TrendingDown className="w-4 h-4" />
    return <Minus className="w-4 h-4" />
  }

  return (
    <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-6 hover:border-slate-700 transition">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-slate-400">{region.name}</p>
          <p className="text-xs text-slate-500 mt-1">{region.code}</p>
        </div>
        <div className={`p-2 rounded-full ${bgColorClass} bg-opacity-10`}>{getTrendIcon()}</div>
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
          {level === 'low' && '✓ Excellent time for workloads'}
          {level === 'medium' && '⚠ Moderate carbon intensity'}
          {level === 'high' && '⚠ High carbon - consider delay'}
        </p>
      </div>

      <div className="mt-4 pt-4 border-t border-slate-800">
        <p className="text-xs text-slate-500">
          Updated: {new Date(data.timestamp).toLocaleTimeString()}
        </p>
      </div>
    </div>
  )
}
