'use client'

import { useState } from 'react'
import { ecobeApi } from '@/lib/api'
import type { RegionStructuralProfile } from '@/types'

const REGIONS = ['US', 'DE', 'FR', 'GB', 'JP', 'SG']

export function EmberStructuralPanel() {
  const [profiles, setProfiles] = useState<Record<string, RegionStructuralProfile | null>>({})
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  async function loadProfiles() {
    setLoading(true)
    try {
      const results: Record<string, RegionStructuralProfile | null> = {}
      await Promise.all(
        REGIONS.map(async (region) => {
          try {
            const data = await ecobeApi.getGridRegionDetail(region)
            // Map to structural profile shape if available
            results[region] = data?.structuralProfile ?? null
          } catch {
            results[region] = null
          }
        })
      )
      setProfiles(results)
      setLoaded(true)
    } finally {
      setLoading(false)
    }
  }

  const trendIcon = (t: string | null) =>
    t === 'increasing' ? '↑' : t === 'decreasing' ? '↓' : '→'

  const trendColor = (t: string | null, invert = false) => {
    if (!t) return 'text-slate-500'
    if (t === 'increasing') return invert ? 'text-red-400' : 'text-emerald-400'
    if (t === 'decreasing') return invert ? 'text-emerald-400' : 'text-red-400'
    return 'text-slate-400'
  }

  return (
    <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-300">
          Ember Structural Region Profiles
          <span className="ml-2 text-xs text-slate-500 font-normal">Validation / structural context only</span>
        </h3>
        {!loaded && (
          <button
            onClick={loadProfiles}
            disabled={loading}
            className="text-xs px-3 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Load Ember Profiles'}
          </button>
        )}
      </div>

      {loaded && Object.keys(profiles).length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {REGIONS.map((region) => {
            const p = profiles[region]
            if (!p) {
              return (
                <div key={region} className="bg-slate-800/50 rounded-lg p-4">
                  <div className="font-mono text-sm text-slate-300 mb-2">{region}</div>
                  <p className="text-xs text-slate-500">No Ember data available</p>
                </div>
              )
            }
            return (
              <div key={region} className="bg-slate-800/50 rounded-lg p-4 space-y-2">
                <div className="font-mono text-sm text-slate-200">{region}</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-slate-500">Carbon Baseline</span>
                  <span className="text-slate-200 text-right">
                    {p.structuralCarbonBaseline != null ? `${p.structuralCarbonBaseline.toFixed(0)} g` : '—'}
                  </span>
                  <span className="text-slate-500">Carbon Trend</span>
                  <span className={`text-right ${trendColor(p.carbonTrendDirection, true)}`}>
                    {trendIcon(p.carbonTrendDirection)} {p.carbonTrendDirection ?? '—'}
                  </span>
                  <span className="text-slate-500">Fossil Dependence</span>
                  <span className="text-right text-orange-400">
                    {p.fossilDependenceScore != null ? `${(p.fossilDependenceScore * 100).toFixed(0)}%` : '—'}
                  </span>
                  <span className="text-slate-500">Renewable Dependence</span>
                  <span className="text-right text-emerald-400">
                    {p.renewableDependenceScore != null ? `${(p.renewableDependenceScore * 100).toFixed(0)}%` : '—'}
                  </span>
                  <span className="text-slate-500">Wind Capacity</span>
                  <span className="text-right text-slate-300">
                    {p.windCapacityGw != null ? `${p.windCapacityGw.toFixed(1)} GW` : '—'}
                    {p.windCapacityTrend && (
                      <span className={`ml-1 ${trendColor(p.windCapacityTrend)}`}>
                        {trendIcon(p.windCapacityTrend)}
                      </span>
                    )}
                  </span>
                  <span className="text-slate-500">Solar Capacity</span>
                  <span className="text-right text-slate-300">
                    {p.solarCapacityGw != null ? `${p.solarCapacityGw.toFixed(1)} GW` : '—'}
                    {p.solarCapacityTrend && (
                      <span className={`ml-1 ${trendColor(p.solarCapacityTrend)}`}>
                        {trendIcon(p.solarCapacityTrend)}
                      </span>
                    )}
                  </span>
                  <span className="text-slate-500">Demand Trend</span>
                  <span className="text-right text-slate-300">
                    {p.demandTrendTwh != null ? `${p.demandTrendTwh.toFixed(0)} TWh` : '—'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-600 mt-1">
                  Source: {p.source ?? 'ember'} · Role: {p.confidenceRole ?? 'validation'}
                </div>
              </div>
            )
          })}
        </div>
      ) : !loaded ? (
        <p className="text-slate-500 text-xs">Click "Load Ember Profiles" to fetch structural region data from Ember.</p>
      ) : (
        <p className="text-slate-500 text-xs">No structural profile data returned.</p>
      )}
    </div>
  )
}
