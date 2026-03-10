'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ecobeApi } from '@/lib/api'
import { Loader2 } from 'lucide-react'
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import type { DashboardDecision } from '@/types'
import { getDecisionSource, isDecisionDelayed } from '@/lib/decisions'

const REGION_COLORS: Record<string, string> = {
  FR: '#10b981',
  SE: '#06b6d4',
  NO: '#8b5cf6',
  'US-CAL-CISO': '#f59e0b',
  DE: '#ef4444',
  GB: '#f97316',
}

const AVAILABLE_REGIONS = ['FR', 'SE', 'NO', 'US-CAL-CISO', 'DE', 'GB']
const CLEAN_THRESHOLD = 100 // gCO₂/kWh — considered "clean window"

export function CarbonOpportunityTimeline() {
  const [selectedRegions, setSelectedRegions] = useState(['FR', 'SE'])
  const [durationHours, setDurationHours] = useState(4)
  const [showDekesMarkers, setShowDekesMarkers] = useState(true)

  const forecasts = useQuery({
    queryKey: ['forecasts', selectedRegions, 72],
    queryFn: async () => {
      const results = await Promise.all(
        selectedRegions.map((r) => ecobeApi.getRegionForecast(r, 72))
      )
      return results
    },
    refetchInterval: 10 * 60_000,
    enabled: selectedRegions.length > 0,
  })

  const dekesDecisions = useQuery({
    queryKey: ['decisions-timeline', 100],
    queryFn: () => ecobeApi.getDecisions(100),
    refetchInterval: 30_000,
  })

  const optimalWindows = useQuery({
    queryKey: ['optimal-windows', selectedRegions, durationHours],
    queryFn: async () => {
      const results = await Promise.all(
        selectedRegions.map((r) => ecobeApi.getOptimalWindow(r, durationHours, 48))
      )
      return results
    },
    enabled: selectedRegions.length > 0,
  })

  const toggleRegion = (r: string) => {
    setSelectedRegions((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r].slice(0, 4)
    )
  }

  // Build unified timeline from all forecasts
  const timelineData = (() => {
    if (!forecasts.data || forecasts.data.length === 0) return []
    const allTimes = new Set<string>()
    forecasts.data.forEach((f) => f.forecasts.forEach((p) => allTimes.add(p.forecastTime)))
    const sortedTimes = Array.from(allTimes).sort()
    return sortedTimes.map((time) => {
      const point: Record<string, unknown> = {
        time: format(parseISO(time), 'MMM d HH:mm'),
        rawTime: time,
      }
      forecasts.data!.forEach((f) => {
        const match = f.forecasts.find((p) => p.forecastTime === time)
        if (match) point[f.region] = match.predictedIntensity
      })
      return point
    })
  })()

  // Clean windows: periods where ALL selected regions dip below threshold
  const cleanWindows = (() => {
    if (!optimalWindows.data) return []
    return optimalWindows.data
      .filter((w) => w.window != null)
      .map((w) => ({
        region: w.region,
        start: format(parseISO(w.window!.startTime), 'MMM d HH:mm'),
        end: format(parseISO(w.window!.endTime), 'MMM d HH:mm'),
        avgIntensity: w.window!.avgIntensity,
        confidence: w.window!.confidence,
      }))
  })()

  // DEKES execution markers — decisions from DEKES source, plotted on the timeline
  const dekesMarkers = (() => {
    const decisions = dekesDecisions.data?.decisions ?? []
    return decisions
      .filter((d) => getDecisionSource(d) === 'DEKES')
      .slice(0, 20)  // limit markers to avoid clutter
      .map((d) => ({
        time: format(parseISO(d.createdAt), 'MMM d HH:mm'),
        delayed: isDecisionDelayed(d),
        region: d.chosenRegion,
        label: isDecisionDelayed(d) ? 'DEKES delayed' : 'DEKES executed',
      }))
  })()

  const now = format(new Date(), 'MMM d HH:mm')

  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Carbon Opportunity Timeline</h3>
          <p className="text-xs text-slate-500 mt-0.5">72h forecast — green zones = recommended execution windows</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">Workload duration:</label>
          <select
            value={durationHours}
            onChange={(e) => setDurationHours(Number(e.target.value))}
            className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-white focus:outline-none"
          >
            {[1, 2, 4, 8, 12].map((h) => (
              <option key={h} value={h}>
                {h}h
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Region toggles + DEKES overlay toggle */}
      <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={() => setShowDekesMarkers((v) => !v)}
          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition flex items-center gap-1.5 ${
            showDekesMarkers
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'border-slate-700 text-slate-500'
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          DEKES jobs
        </button>
        <div className="w-px h-4 bg-slate-700" />
        {AVAILABLE_REGIONS.map((r) => {
          const active = selectedRegions.includes(r)
          const color = REGION_COLORS[r] ?? '#64748b'
          return (
            <button
              key={r}
              onClick={() => toggleRegion(r)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                active ? 'border-transparent text-white' : 'border-slate-700 text-slate-500 bg-transparent'
              }`}
              style={active ? { backgroundColor: color + '30', borderColor: color, color } : {}}
            >
              {r}
            </button>
          )
        })}
      </div>

      {forecasts.isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
        </div>
      )}

      {forecasts.isError && (
        <div className="py-12 text-center">
          <p className="text-sm text-slate-500">Connect ECOBE Engine to view forecast data</p>
          <p className="text-xs text-slate-600 mt-1">GET /api/v1/forecasting/:region/forecasts</p>
        </div>
      )}

      {timelineData.length > 0 && (
        <div>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={timelineData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                {selectedRegions.map((r) => (
                  <linearGradient key={r} id={`grad-${r}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={REGION_COLORS[r] ?? '#64748b'} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={REGION_COLORS[r] ?? '#64748b'} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />

              {/* Clean window reference areas */}
              {cleanWindows.map((w, i) => (
                <ReferenceArea
                  key={i}
                  x1={w.start}
                  x2={w.end}
                  fill="#10b981"
                  fillOpacity={0.08}
                  stroke="#10b981"
                  strokeOpacity={0.3}
                  strokeWidth={1}
                  label={{
                    value: `Clean Window (${w.region})`,
                    fill: '#10b981',
                    fontSize: 10,
                    position: 'top',
                  }}
                />
              ))}

              {/* Clean threshold line */}
              <ReferenceLine
                y={CLEAN_THRESHOLD}
                stroke="#10b981"
                strokeDasharray="4 2"
                strokeOpacity={0.5}
                label={{ value: 'Clean (<100)', fill: '#10b981', fontSize: 9, position: 'right' }}
              />

              {/* Now marker */}
              <ReferenceLine
                x={now}
                stroke="#64748b"
                strokeDasharray="2 2"
                label={{ value: 'now', fill: '#64748b', fontSize: 9, position: 'top' }}
              />

              {/* DEKES execution markers */}
              {showDekesMarkers &&
                dekesMarkers.map((m, i) => (
                  <ReferenceLine
                    key={i}
                    x={m.time}
                    stroke={m.delayed ? '#f59e0b' : '#10b981'}
                    strokeDasharray="2 3"
                    strokeOpacity={0.7}
                    label={{
                      value: m.delayed ? '⏸' : '▶',
                      fill: m.delayed ? '#f59e0b' : '#10b981',
                      fontSize: 10,
                      position: 'top',
                    }}
                  />
                ))}

              <XAxis
                dataKey="time"
                tick={{ fill: '#475569', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                interval={Math.floor(timelineData.length / 8)}
              />
              <YAxis
                tick={{ fill: '#475569', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={36}
                label={{
                  value: 'gCO₂/kWh',
                  angle: -90,
                  position: 'insideLeft',
                  fill: '#475569',
                  fontSize: 9,
                  offset: 8,
                }}
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
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />

              {selectedRegions.map((r) => (
                <Line
                  key={r}
                  type="monotone"
                  dataKey={r}
                  stroke={REGION_COLORS[r] ?? '#64748b'}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  connectNulls
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* DEKES marker legend */}
      {showDekesMarkers && dekesMarkers.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <span className="text-emerald-400 font-bold">▶</span>
            DEKES job executed
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-yellow-400 font-bold">⏸</span>
            DEKES job delayed to clean window
          </div>
          <span className="ml-auto text-slate-600">{dekesMarkers.length} DEKES events shown</span>
        </div>
      )}

      {/* Optimal windows summary */}
      {cleanWindows.length > 0 && (
        <div className="border-t border-slate-800 pt-4">
          <p className="text-xs text-slate-400 mb-3">Recommended execution windows</p>
          <div className="space-y-2">
            {cleanWindows.map((w, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-2 bg-emerald-500/5 border border-emerald-500/20 rounded-lg"
              >
                <div>
                  <span className="text-xs font-medium text-emerald-400">{w.region}</span>
                  <span className="text-xs text-slate-400 ml-2">
                    {w.start} → {w.end}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-emerald-400">{w.avgIntensity} gCO₂/kWh avg</span>
                  <span className="text-slate-500">{(w.confidence * 100).toFixed(0)}% confidence</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
