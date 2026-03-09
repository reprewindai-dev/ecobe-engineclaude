'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ecobeApi, type GreenRoutingRequest } from '@/lib/api'
import {
  getCarbonLevel,
  getCarbonColor,
  getQualityTierBadge,
  getQualityTierColor,
  getStabilityColor,
} from '@/types'
import type { GreenRoutingResult, PolicyDelayResponse } from '@/types'
import {
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  AlertTriangle,
  Info,
  Zap,
} from 'lucide-react'

const REGIONS = [
  'US-CAL-CISO',
  'FR',
  'DE',
  'GB',
  'SE',
  'NO',
  'BR',
  'JP',
  'AU-NSW',
  'SG',
  'US-MIDA-PJM',
  'US-TEX-ERCO',
]

function isPolicyDelay(r: GreenRoutingResult | PolicyDelayResponse): r is PolicyDelayResponse {
  return (r as PolicyDelayResponse).action === 'delay'
}

export function GreenRoutingForm() {
  const [formData, setFormData] = useState<GreenRoutingRequest>({
    preferredRegions: ['US-CAL-CISO', 'FR', 'DE'],
    maxCarbonGPerKwh: 400,
    carbonWeight: 0.5,
    latencyWeight: 0.3,
    costWeight: 0.2,
  })

  const mutation = useMutation({
    mutationFn: (data: GreenRoutingRequest) => ecobeApi.routeGreen(data),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate(formData)
  }

  const toggleRegion = (region: string) => {
    const current = formData.preferredRegions
    setFormData({
      ...formData,
      preferredRegions: current.includes(region)
        ? current.filter((r) => r !== region)
        : [...current, region],
    })
  }

  const result = mutation.data

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-white">Green Routing Optimizer</h3>
        <p className="text-slate-400 text-sm mt-1">
          Find the optimal region based on carbon, latency, and cost signals.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Region Selection */}
            <div>
              <label className="text-sm font-medium text-slate-300 mb-3 block">
                Candidate Regions ({formData.preferredRegions.length} selected)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {REGIONS.map((region) => (
                  <button
                    key={region}
                    type="button"
                    onClick={() => toggleRegion(region)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      formData.preferredRegions.includes(region)
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    {region}
                  </button>
                ))}
              </div>
            </div>

            {/* Max Carbon */}
            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">
                Max Carbon Intensity (gCO₂/kWh)
              </label>
              <input
                type="number"
                value={formData.maxCarbonGPerKwh || ''}
                onChange={(e) =>
                  setFormData({ ...formData, maxCarbonGPerKwh: Number(e.target.value) })
                }
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
                placeholder="400"
              />
            </div>

            {/* Weights */}
            <div className="space-y-4">
              <p className="text-sm font-medium text-slate-300">Optimization Weights</p>
              {(
                [
                  { key: 'carbonWeight', label: 'Carbon Priority' },
                  { key: 'latencyWeight', label: 'Latency Priority' },
                  { key: 'costWeight', label: 'Cost Priority' },
                ] as const
              ).map(({ key, label }) => (
                <div key={key}>
                  <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                    <span>{label}</span>
                    <span>{((formData[key] ?? 0) * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={formData[key]}
                    onChange={(e) =>
                      setFormData({ ...formData, [key]: Number(e.target.value) })
                    }
                    className="w-full accent-emerald-500"
                  />
                </div>
              ))}
            </div>

            <button
              type="submit"
              disabled={mutation.isPending || formData.preferredRegions.length === 0}
              className="w-full bg-emerald-500 text-white py-3 rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Optimizing...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Route Workload
                </>
              )}
            </button>
          </form>
        </div>

        {/* Results */}
        <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
          <h4 className="text-lg font-semibold text-white mb-5">Routing Decision</h4>

          {mutation.isPending && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
            </div>
          )}

          {mutation.isError && (
            <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-400">Optimization Failed</p>
                <p className="text-xs text-red-300/70 mt-1">
                  {mutation.error instanceof Error ? mutation.error.message : 'Unknown error'}
                </p>
              </div>
            </div>
          )}

          {/* Policy delay (HTTP 202) */}
          {mutation.isSuccess && result && isPolicyDelay(result) && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <Clock className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-yellow-400">Policy: Delay Required</p>
                  <p className="text-xs text-yellow-300/70 mt-1">{result.message}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-xs text-slate-400 mb-1">Retry after</p>
                  <p className="text-lg font-bold text-yellow-400">
                    {result.retryAfterMinutes} min
                  </p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-xs text-slate-400 mb-1">Best available now</p>
                  <p className="text-base font-bold text-white">{result.currentBest.region}</p>
                  <p className="text-xs text-slate-500">{result.currentBest.carbonIntensity} gCO₂/kWh</p>
                </div>
              </div>
              <div className="bg-slate-800/30 rounded-lg p-3 text-xs text-slate-400">
                Policy: maxCarbon {result.policy.maxCarbonGPerKwh} gCO₂/kWh
                {result.policy.requireGreenRouting ? ' · green routing required' : ''}
              </div>
            </div>
          )}

          {/* Success result */}
          {mutation.isSuccess && result && !isPolicyDelay(result) && (() => {
            const r = result as GreenRoutingResult
            return (
              <div className="space-y-4">
                {/* Selected region header */}
                <div className="flex items-start gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs text-emerald-400 font-medium">Selected Region</p>
                    <p className="text-2xl font-bold text-white mt-1">{r.selectedRegion}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-semibold ${getQualityTierBadge(r.qualityTier)}`}>
                    {r.qualityTier?.toUpperCase()}
                  </span>
                </div>

                {/* Key metrics */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">Carbon Intensity</p>
                    <p className={`text-lg font-bold ${getCarbonColor(getCarbonLevel(r.carbonIntensity))}`}>
                      {r.carbonIntensity}
                    </p>
                    <p className="text-xs text-slate-500">gCO₂/kWh</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">Carbon Delta</p>
                    <p className="text-lg font-bold text-sky-400">+{r.carbon_delta_g_per_kwh}</p>
                    <p className="text-xs text-slate-500">vs worst candidate</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">Score</p>
                    <p className={`text-lg font-bold ${getQualityTierColor(r.qualityTier)}`}>
                      {(r.score * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">Forecast Stability</p>
                    <p className={`text-base font-bold capitalize ${getStabilityColor(r.forecast_stability)}`}>
                      {r.forecast_stability ?? '—'}
                    </p>
                  </div>
                </div>

                {/* Provider disagreement */}
                {r.provider_disagreement?.flag && (
                  <div className="flex items-start gap-2 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg text-xs">
                    <AlertTriangle className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
                    <span className="text-orange-300">
                      Provider disagreement detected
                      {r.provider_disagreement.pct != null &&
                        ` (${r.provider_disagreement.pct.toFixed(1)}% divergence)`}
                    </span>
                  </div>
                )}

                {/* Explanation */}
                {r.explanation && (
                  <div className="bg-slate-800/30 rounded-lg p-3 border-l-2 border-emerald-500/40">
                    <p className="text-xs text-slate-400 mb-1">Engine Explanation</p>
                    <p className="text-sm text-slate-200">{r.explanation}</p>
                  </div>
                )}

                {/* Predicted clean window */}
                {r.predicted_clean_window &&
                  r.predicted_clean_window.drop_probability > 0.7 && (
                    <div className="p-3 bg-sky-500/5 border border-sky-500/20 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-4 h-4 text-sky-400" />
                        <p className="text-xs font-semibold text-sky-400">
                          Cleaner Window Predicted
                        </p>
                        <span className="text-xs text-sky-300/70 ml-auto">
                          {(r.predicted_clean_window.drop_probability * 100).toFixed(0)}% probability
                        </span>
                      </div>
                      <p className="text-sm text-slate-200">
                        Wait{' '}
                        <span className="text-sky-400 font-semibold">
                          ~{r.predicted_clean_window.expected_minutes} min
                        </span>{' '}
                        →{' '}
                        <span className="text-sky-400 font-semibold">
                          {r.predicted_clean_window.region}
                        </span>{' '}
                        drops from {r.predicted_clean_window.current_intensity} to{' '}
                        <span className="text-emerald-400 font-semibold">
                          {r.predicted_clean_window.predicted_intensity} gCO₂/kWh
                        </span>{' '}
                        (−{r.predicted_clean_window.drop_pct.toFixed(0)}%)
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Reliability: {r.predicted_clean_window.reliability_tier}
                      </p>
                    </div>
                  )}

                {/* Alternatives */}
                {r.alternatives && r.alternatives.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-400 mb-2">All Candidates</p>
                    <div className="space-y-1.5">
                      {r.alternatives.slice(0, 4).map((alt) => (
                        <div
                          key={alt.region}
                          className="flex items-center justify-between p-2.5 bg-slate-800/30 rounded-lg text-xs"
                        >
                          <span className="font-mono text-slate-300">{alt.region}</span>
                          <div className="flex items-center gap-3">
                            <span className={getCarbonColor(getCarbonLevel(alt.carbonIntensity))}>
                              {alt.carbonIntensity} gCO₂/kWh
                            </span>
                            <span className="text-slate-500">
                              {(alt.score * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Frame ID for replay */}
                {r.decisionFrameId && (
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <Info className="w-3.5 h-3.5" />
                    <span>
                      Frame ID:{' '}
                      <code className="text-slate-500 font-mono">{r.decisionFrameId}</code>
                    </span>
                  </div>
                )}
              </div>
            )
          })()}

          {!mutation.isPending && !mutation.isError && !mutation.isSuccess && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-600">
              <Zap className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">Select regions and route your workload</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
