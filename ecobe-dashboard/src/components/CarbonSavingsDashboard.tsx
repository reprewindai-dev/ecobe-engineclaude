'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ecobeApi } from '@/lib/api'
import { Loader2, TrendingDown, Leaf, Car } from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { format, parseISO } from 'date-fns'

type Window = '24h' | '7d' | '30d'

export function CarbonSavingsDashboard() {
  const [window, setWindow] = useState<Window>('7d')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard-savings', window],
    queryFn: () => ecobeApi.getDashboardSavings(window),
    refetchInterval: 60_000,
  })

  const savedKg = data ? (data.totalCO2SavedG / 1000).toFixed(2) : null
  const savedTons = data ? (data.totalCO2SavedG / 1_000_000).toFixed(3) : null

  const chartData = data?.trend?.map((t) => ({
    date: format(parseISO(t.date), 'MMM d'),
    saved: +(t.co2SavedG / 1000).toFixed(2),
    baseline: +(t.co2BaselineG / 1000).toFixed(2),
    decisions: t.decisions,
  }))

  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Carbon Savings</h3>
          <p className="text-xs text-slate-500 mt-0.5">Proof of impact</p>
        </div>
        <div className="flex rounded-lg overflow-hidden border border-slate-700">
          {(['24h', '7d', '30d'] as Window[]).map((w) => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              className={`px-3 py-1.5 text-xs font-medium transition ${
                window === w
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
        </div>
      )}

      {isError && (
        <p className="text-sm text-red-400">Failed to load savings data</p>
      )}

      {data && (
        <>
          {/* KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4">
              <div className="flex items-center space-x-1.5 mb-1">
                <TrendingDown className="w-4 h-4 text-emerald-400" />
                <p className="text-xs text-slate-400">CO₂ Avoided</p>
              </div>
              <p className="text-2xl font-bold text-emerald-400">{savedKg}</p>
              <p className="text-xs text-slate-500">kg this {window}</p>
            </div>

            <div className="bg-slate-800/40 rounded-lg p-4">
              <p className="text-xs text-slate-400 mb-1">Savings Rate</p>
              <p className="text-2xl font-bold text-white">{data.savingsPct.toFixed(1)}%</p>
              <p className="text-xs text-slate-500">vs baseline routing</p>
            </div>

            <div className="bg-slate-800/40 rounded-lg p-4">
              <div className="flex items-center space-x-1.5 mb-1">
                <Car className="w-4 h-4 text-sky-400" />
                <p className="text-xs text-slate-400">km not driven</p>
              </div>
              <p className="text-2xl font-bold text-sky-400">
                {data.savedEquivalents.kmDriven.toLocaleString()}
              </p>
            </div>

            <div className="bg-slate-800/40 rounded-lg p-4">
              <div className="flex items-center space-x-1.5 mb-1">
                <Leaf className="w-4 h-4 text-teal-400" />
                <p className="text-xs text-slate-400">Tree-days</p>
              </div>
              <p className="text-2xl font-bold text-teal-400">
                {data.savedEquivalents.treeDays.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Trend Chart */}
          {chartData && chartData.length > 0 && (
            <div>
              <p className="text-xs text-slate-400 mb-3">CO₂ Saved vs Baseline (kg)</p>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="savedGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="baselineGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#64748b" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#64748b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #1e293b',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="baseline"
                    stroke="#475569"
                    fill="url(#baselineGradient)"
                    strokeWidth={1.5}
                    name="Baseline kg"
                    strokeDasharray="4 2"
                  />
                  <Area
                    type="monotone"
                    dataKey="saved"
                    stroke="#10b981"
                    fill="url(#savedGradient)"
                    strokeWidth={2}
                    name="Saved kg"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Per-region breakdown */}
          {data.byRegion.length > 0 && (
            <div>
              <p className="text-xs text-slate-400 mb-3">By Chosen Region</p>
              <div className="space-y-2">
                {data.byRegion.slice(0, 6).map((r) => (
                  <div key={r.region} className="flex items-center gap-3">
                    <span className="text-xs text-slate-400 w-28 flex-shrink-0 font-mono">
                      {r.region}
                    </span>
                    <div className="flex-1 bg-slate-800 rounded-full h-1.5">
                      <div
                        className="bg-emerald-500 h-full rounded-full"
                        style={{ width: `${Math.min(r.savingsPct, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-emerald-400 w-16 text-right">
                      {r.savingsPct.toFixed(1)}%
                    </span>
                    <span className="text-xs text-slate-500 w-20 text-right">
                      {r.decisions} decisions
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
