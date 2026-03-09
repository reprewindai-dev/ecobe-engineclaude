'use client'

import { useQuery } from '@tanstack/react-query'
import { ecobeApi } from '@/lib/api'
import { Loader2, BarChart3 } from 'lucide-react'
import type { DashboardDecision } from '@/types'
import { getDecisionSource } from '@/lib/decisions'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

const SOURCE_COLORS: Record<string, string> = {
  DEKES: '#10b981',
  'CI/CD': '#06b6d4',
  Manual: '#8b5cf6',
  API: '#f59e0b',
  Other: '#64748b',
}

interface SourceCO2 {
  source: string
  co2AvoidedKg: number
  decisions: number
  color: string
}

function computeSourceCO2(decisions: DashboardDecision[]): SourceCO2[] {
  const map = new Map<string, { co2G: number; decisions: number }>()

  for (const d of decisions) {
    const source = getDecisionSource(d)
    if (!map.has(source)) map.set(source, { co2G: 0, decisions: 0 })
    const entry = map.get(source)!
    entry.decisions++
    if (d.co2BaselineG != null && d.co2ChosenG != null) {
      entry.co2G += d.co2BaselineG - d.co2ChosenG
    }
  }

  return Array.from(map.entries())
    .map(([source, s]) => ({
      source,
      co2AvoidedKg: Math.max(0, s.co2G / 1000),
      decisions: s.decisions,
      color: SOURCE_COLORS[source] ?? '#64748b',
    }))
    .filter((s) => s.co2AvoidedKg > 0 || s.decisions > 0)
    .sort((a, b) => b.co2AvoidedKg - a.co2AvoidedKg)
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ value: number; payload: SourceCO2 }>
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs">
      <p className="font-semibold text-white mb-1">{d.source}</p>
      <p className="text-emerald-400">{d.co2AvoidedKg.toFixed(2)} kg CO₂ avoided</p>
      <p className="text-slate-400">{d.decisions} decisions</p>
    </div>
  )
}

export function WorkloadImpactGraph() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['decisions', 500],
    queryFn: () => ecobeApi.getDecisions(500),
    refetchInterval: 60_000,
  })

  const decisions = data?.decisions ?? []
  const chartData = computeSourceCO2(decisions)

  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 space-y-5">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-emerald-400" />
        <div>
          <h3 className="text-lg font-semibold text-white">Carbon Avoided by Source</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            CO₂ reduction attributed to each workload source — from ECOBE decision log
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
        </div>
      )}

      {isError && (
        <p className="text-sm text-slate-500 py-8 text-center">
          Connect ECOBE Engine to view workload impact
        </p>
      )}

      {!isLoading && chartData.length === 0 && !isError && (
        <p className="text-sm text-slate-500 py-8 text-center">No CO₂ savings data yet</p>
      )}

      {chartData.length > 0 && (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="source"
                tick={{ fill: '#94a3b8', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#475569', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={44}
                label={{
                  value: 'kg CO₂',
                  angle: -90,
                  position: 'insideLeft',
                  fill: '#475569',
                  fontSize: 9,
                  offset: 8,
                }}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#1e293b' }} />
              <Bar dataKey="co2AvoidedKg" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="flex flex-wrap gap-3">
            {chartData.map((s) => (
              <div key={s.source} className="flex items-center gap-1.5 text-xs text-slate-400">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
                <span>
                  {s.source}{' '}
                  <span className="text-white font-medium">{s.co2AvoidedKg.toFixed(1)}kg</span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
