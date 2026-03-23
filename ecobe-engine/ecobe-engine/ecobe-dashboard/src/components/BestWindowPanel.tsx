'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ecobeApi } from '@/lib/api'
import { CalendarClock, Loader2, CheckCircle } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import type { BestWindowResult } from '@/types'

const CONFIDENCE_COLORS: Record<BestWindowResult['confidence'], string> = {
  high: 'text-emerald-400',
  medium: 'text-yellow-400',
  low: 'text-red-400',
}

export function BestWindowPanel() {
  const [regions, setRegions] = useState('FR, SE, DE')
  const [durationHours, setDurationHours] = useState(4)

  const mutation = useMutation({
    mutationFn: () =>
      ecobeApi.getBestWindow({
        regions: regions
          .split(/[,\s]+/)
          .map((r) => r.trim().toUpperCase())
          .filter(Boolean),
        durationHours,
        lookAheadHours: 72,
      }),
  })

  const result = mutation.data

  function formatWindowTime(iso: string) {
    try {
      return format(parseISO(iso), "EEE HH:mm 'UTC'")
    } catch {
      return iso
    }
  }

  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 space-y-5">
      <div className="flex items-center gap-2">
        <CalendarClock className="w-5 h-5 text-emerald-400" />
        <div>
          <h3 className="text-lg font-semibold text-white">Scheduling Advisor</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Find the optimal execution window based on historical carbon patterns
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-40">
          <label className="text-xs text-slate-400 block mb-1.5">Regions (comma-separated)</label>
          <input
            type="text"
            value={regions}
            onChange={(e) => setRegions(e.target.value)}
            placeholder="FR, SE, DE"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1.5">Duration</label>
          <select
            value={durationHours}
            onChange={(e) => setDurationHours(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {[1, 2, 4, 6, 8, 12, 24].map((h) => (
              <option key={h} value={h}>
                {h}h
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition flex items-center gap-2"
        >
          {mutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CalendarClock className="w-4 h-4" />
          )}
          Find Best Window
        </button>
      </div>

      {/* Error */}
      {mutation.isError && (
        <p className="text-sm text-red-400">
          {mutation.error instanceof Error ? mutation.error.message : 'No window data available'}
        </p>
      )}

      {/* Result */}
      {result && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span className="text-emerald-400 text-sm font-medium">Optimal window found</span>
          </div>

          {/* Hero result */}
          <div>
            <p className="text-slate-400 text-xs mb-1">Best time to run in {result.region}</p>
            <p className="text-2xl font-bold text-white">
              {formatWindowTime(result.startTime)}
            </p>
            <p className="text-slate-400 text-sm mt-0.5">
              through {formatWindowTime(result.endTime)}
            </p>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-800/60 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-1">Avg intensity</p>
              <p className="text-lg font-bold text-white">
                {result.avgHistoricalIntensity.toFixed(0)}
              </p>
              <p className="text-xs text-slate-500">gCO₂/kWh</p>
            </div>
            <div className="bg-slate-800/60 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-1">vs. daily avg</p>
              <p className="text-lg font-bold text-emerald-400">
                {result.cleanerThanAvgPct > 0 ? '−' : '+'}
                {Math.abs(result.cleanerThanAvgPct).toFixed(0)}%
              </p>
              <p className="text-xs text-slate-500">
                {result.cleanerThanAvgPct > 0 ? 'below average' : 'above average'}
              </p>
            </div>
            <div className="bg-slate-800/60 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-1">Confidence</p>
              <p className={`text-lg font-bold ${CONFIDENCE_COLORS[result.confidence]}`}>
                {result.confidence.toUpperCase()}
              </p>
              <p className="text-xs text-slate-500">historical fit</p>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Historically,{' '}
            <span className="text-white font-medium">{result.region}</span> is{' '}
            <span className="text-emerald-400 font-medium">
              {result.cleanerThanAvgPct.toFixed(0)}% below average intensity
            </span>{' '}
            at this window. Based on {durationHours}h workload duration across 72h look-ahead.
          </p>
        </div>
      )}
    </div>
  )
}
