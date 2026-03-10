'use client'

import { useQuery } from '@tanstack/react-query'
import { ecobeApi } from '@/lib/api'
import { TrendingDown, TrendingUp, Minus } from 'lucide-react'

interface Props {
  region: string
}

export function OpportunityInsight({ region }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['opportunity', region],
    queryFn: () => ecobeApi.predictOpportunity(region),
    enabled: !!region,
    staleTime: 5 * 60_000,
    retry: false,
  })

  if (isLoading || !data) return null

  const pct = data.cleanerThanAvgPct
  const isPositive = pct > 0
  const isNeutral = Math.abs(pct) < 3

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg border text-xs ${
        isNeutral
          ? 'bg-slate-800/40 border-slate-700/50'
          : isPositive
            ? 'bg-emerald-500/5 border-emerald-500/20'
            : 'bg-orange-500/5 border-orange-500/20'
      }`}
    >
      <div className="flex-shrink-0 mt-0.5">
        {isNeutral ? (
          <Minus className="w-4 h-4 text-slate-400" />
        ) : isPositive ? (
          <TrendingDown className="w-4 h-4 text-emerald-400" />
        ) : (
          <TrendingUp className="w-4 h-4 text-orange-400" />
        )}
      </div>
      <div>
        <p className={isNeutral ? 'text-slate-300' : isPositive ? 'text-emerald-300' : 'text-orange-300'}>
          Historically,{' '}
          <span className="font-semibold">{region}</span> is{' '}
          {isNeutral ? (
            'near average intensity'
          ) : (
            <>
              <span className="font-bold">{Math.abs(pct).toFixed(0)}%</span>{' '}
              {isPositive ? 'cleaner' : 'dirtier'} than average
            </>
          )}{' '}
          at this hour ({data.currentHour.toString().padStart(2, '0')}:00 UTC).
        </p>
        <p className="text-slate-500 mt-0.5">
          {data.historicalAvg.toFixed(0)} gCO₂/kWh typical now vs {data.overallAvg.toFixed(0)} gCO₂/kWh all-day avg
          {data.sampleCount > 0 && ` · ${data.sampleCount} historical samples`}
        </p>
      </div>
    </div>
  )
}
