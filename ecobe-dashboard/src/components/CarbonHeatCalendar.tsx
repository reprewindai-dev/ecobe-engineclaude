'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ecobeApi } from '@/lib/api'
import { Loader2, CalendarDays } from 'lucide-react'
import type { HourlySlot, RegionPatternData } from '@/types'

const DEFAULT_REGIONS = ['FR', 'SE', 'DE']
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOURS = Array.from({ length: 24 }, (_, i) => i)

// Each slot in the 168-slot array is indexed as: day * 24 + hour
function getSlot(slots: HourlySlot[], day: number, hour: number): HourlySlot | undefined {
  return slots.find((s) => s.hour === day * 24 + hour)
}

function intensityToStyle(
  intensity: number | undefined,
  min: number,
  max: number
): React.CSSProperties {
  if (intensity == null) return { backgroundColor: '#1e293b' }
  if (max === min) return { backgroundColor: '#334155' }
  const ratio = (intensity - min) / (max - min)
  let r: number, g: number, b: number
  if (ratio < 0.5) {
    // green → yellow
    r = Math.round(ratio * 2 * 220)
    g = Math.round(160 + ratio * 2 * 60)
    b = 0
  } else {
    // yellow → red
    r = 220
    g = Math.round(220 - (ratio - 0.5) * 2 * 220)
    b = 0
  }
  return { backgroundColor: `rgb(${r},${g},${b})` }
}

function RegionHeatGrid({ data }: { data: RegionPatternData }) {
  const allIntensities = data.slots.map((s) => s.avgIntensity).filter(Boolean)
  const min = Math.min(...allIntensities)
  const max = Math.max(...allIntensities)

  const [tooltip, setTooltip] = useState<{
    day: number
    hour: number
    intensity: number
    count: number
  } | null>(null)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-white">{data.region}</h4>
        <span className="text-xs text-slate-500">
          avg {data.overallAvg.toFixed(0)} gCO₂/kWh
        </span>
      </div>

      {/* Hour axis */}
      <div className="flex">
        <div className="w-9 flex-shrink-0" />
        <div className="flex-1 flex justify-between px-0.5">
          {[0, 4, 8, 12, 16, 20, 23].map((h) => (
            <span key={h} className="text-[10px] text-slate-600">
              {h.toString().padStart(2, '0')}
            </span>
          ))}
        </div>
      </div>

      {/* Grid: 7 rows (days) × 24 columns (hours) */}
      <div className="space-y-0.5">
        {DAYS.map((day, di) => (
          <div key={day} className="flex items-center gap-0.5">
            <span className="w-8 text-[10px] text-slate-500 text-right pr-1 flex-shrink-0">
              {day}
            </span>
            <div className="flex-1 flex gap-0.5">
              {HOURS.map((hour) => {
                const slot = getSlot(data.slots, di, hour)
                const intensity = slot?.avgIntensity
                return (
                  <div
                    key={hour}
                    className="flex-1 h-4 rounded-[2px] cursor-pointer transition-opacity hover:opacity-80 relative"
                    style={intensityToStyle(intensity, min, max)}
                    onMouseEnter={() =>
                      intensity != null &&
                      setTooltip({ day: di, hour, intensity, count: slot?.sampleCount ?? 0 })
                    }
                    onMouseLeave={() => setTooltip(null)}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div className="text-xs text-slate-300 bg-slate-800 border border-slate-700 rounded px-2 py-1 inline-block">
          {DAYS[tooltip.day]} {tooltip.hour.toString().padStart(2, '0')}:00 UTC —{' '}
          <span className="text-white font-medium">{tooltip.intensity.toFixed(0)} gCO₂/kWh</span>
          <span className="text-slate-500 ml-1">({tooltip.count} samples)</span>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-2 mt-1">
        <span className="text-[10px] text-slate-500">Low {min.toFixed(0)}</span>
        <div className="flex-1 h-1.5 rounded-full overflow-hidden">
          <div
            className="h-full w-full"
            style={{
              background: 'linear-gradient(to right, rgb(0,160,0), rgb(220,220,0), rgb(220,0,0))',
            }}
          />
        </div>
        <span className="text-[10px] text-slate-500">High {max.toFixed(0)}</span>
      </div>
    </div>
  )
}

export function CarbonHeatCalendar() {
  const [selectedRegions, setSelectedRegions] = useState<string[]>(DEFAULT_REGIONS)
  const [inputValue, setInputValue] = useState(DEFAULT_REGIONS.join(', '))

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['intelligence-patterns', selectedRegions],
    queryFn: () => ecobeApi.getIntelligencePatterns(selectedRegions),
    staleTime: 5 * 60_000,
  })

  function applyRegions() {
    const parsed = inputValue
      .split(/[,\s]+/)
      .map((r) => r.trim().toUpperCase())
      .filter(Boolean)
    setSelectedRegions(parsed.length > 0 ? parsed : DEFAULT_REGIONS)
  }

  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-emerald-400" />
          <div>
            <h3 className="text-lg font-semibold text-white">Carbon Intensity Patterns</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              168-slot weekly heat calendar — historical hourly averages per region
            </p>
          </div>
        </div>

        {/* Region selector */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyRegions()}
            placeholder="FR, SE, DE"
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 w-36 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <button
            onClick={applyRegions}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg transition"
          >
            Load
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
          <span className="ml-2 text-slate-400 text-sm">Loading patterns…</span>
        </div>
      )}

      {error && (
        <div className="text-center py-10 text-slate-500 text-sm">
          <p>No pattern data available.</p>
          <button
            onClick={() => refetch()}
            className="mt-2 text-emerald-400 hover:text-emerald-300 text-xs underline"
          >
            Retry
          </button>
        </div>
      )}

      {data && (
        <div className="space-y-8">
          {data.regions.map((region) => (
            <RegionHeatGrid key={region.region} data={region} />
          ))}
          <p className="text-[10px] text-slate-600 text-right">
            Generated {new Date(data.generatedAt).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  )
}
