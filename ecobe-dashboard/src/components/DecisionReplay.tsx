'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ecobeApi } from '@/lib/api'
import { getQualityTierBadge, getQualityTierColor, getStabilityColor } from '@/types'
import { Loader2, Search, AlertCircle, CheckCircle, XCircle, Tag, Building2, Cpu, ShieldCheck } from 'lucide-react'

export function DecisionReplay() {
  const [frameId, setFrameId] = useState('')

  const mutation = useMutation({
    mutationFn: (id: string) => ecobeApi.replayDecision(id),
  })

  const handleReplay = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = frameId.trim()
    if (trimmed) mutation.mutate(trimmed)
  }

  const data = mutation.data

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-white">Decision Replay</h3>
        <p className="text-slate-400 text-sm mt-1">
          Reconstruct any past routing decision from its frame ID.
        </p>
      </div>

      {/* Input */}
      <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
        <form onSubmit={handleReplay} className="flex gap-3">
          <input
            type="text"
            value={frameId}
            onChange={(e) => setFrameId(e.target.value)}
            placeholder="Enter Decision Frame ID (from routing response)"
            className="flex-1 px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm font-mono placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
          />
          <button
            type="submit"
            disabled={mutation.isPending || !frameId.trim()}
            className="px-4 py-2.5 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
          >
            {mutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            Replay
          </button>
        </form>

        <p className="text-xs text-slate-600 mt-2">
          Frame IDs are returned in the <code className="text-slate-500">decisionFrameId</code> field of green routing responses.
        </p>
      </div>

      {/* Error */}
      {mutation.isError && (
        <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-400">Replay Failed</p>
            <p className="text-xs text-red-300/60 mt-1">
              {mutation.error instanceof Error ? mutation.error.message : 'Decision frame not found'}
            </p>
          </div>
        </div>
      )}

      {/* Result */}
      {data && (
        <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 space-y-5">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            <div>
              <p className="text-sm font-medium text-emerald-400">Decision Reconstructed</p>
              <p className="text-xs text-slate-500 font-mono mt-0.5">{data.decisionFrameId}</p>
            </div>
          </div>

          {/* Workload context — source, org, workloadType */}
          {(data.sourceUsed || data.organizationId || data.workloadType || data.source) && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {data.sourceUsed && (
                <div className="bg-slate-800/40 rounded-lg p-2.5 flex items-center gap-2">
                  <Tag className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-slate-500">Signal Source</p>
                    <p className="text-xs font-medium text-white font-mono">{data.sourceUsed}</p>
                  </div>
                </div>
              )}
              {data.organizationId && (
                <div className="bg-slate-800/40 rounded-lg p-2.5 flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-slate-500">Organization</p>
                    <p className="text-xs font-medium text-white truncate">{data.organizationId}</p>
                  </div>
                </div>
              )}
              {data.workloadType && (
                <div className="bg-slate-800/40 rounded-lg p-2.5 flex items-center gap-2">
                  <Cpu className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-slate-500">Workload Type</p>
                    <p className="text-xs font-medium text-white capitalize">{data.workloadType}</p>
                  </div>
                </div>
              )}
              {data.source && (
                <div
                  className={`rounded-lg p-2.5 flex items-center gap-2 ${
                    data.source === 'DEKES'
                      ? 'bg-emerald-500/10 border border-emerald-500/20'
                      : 'bg-slate-800/40'
                  }`}
                >
                  <Tag
                    className={`w-3.5 h-3.5 flex-shrink-0 ${data.source === 'DEKES' ? 'text-emerald-400' : 'text-slate-400'}`}
                  />
                  <div>
                    <p className="text-[10px] text-slate-500">Source</p>
                    <p
                      className={`text-xs font-bold ${data.source === 'DEKES' ? 'text-emerald-400' : 'text-slate-300'}`}
                    >
                      {data.source}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Policy checks summary */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <div className="bg-slate-800/40 rounded-lg p-2.5 flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <div>
                <p className="text-[10px] text-slate-500">Fallback used</p>
                <p className={`text-xs font-medium ${data.fallbackUsed ? 'text-orange-400' : 'text-emerald-400'}`}>
                  {data.fallbackUsed ? 'Yes' : 'No'}
                </p>
              </div>
            </div>
            <div className="bg-slate-800/40 rounded-lg p-2.5 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <div>
                <p className="text-[10px] text-slate-500">Provider disagreement</p>
                <p className={`text-xs font-medium ${data.providerDisagreement ? 'text-red-400' : 'text-emerald-400'}`}>
                  {data.providerDisagreement ? 'Detected' : 'None'}
                </p>
              </div>
            </div>
            <div className="bg-slate-800/40 rounded-lg p-2.5 flex items-center gap-2">
              <Tag className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <div>
                <p className="text-[10px] text-slate-500">Forecast stability</p>
                <p className={`text-xs font-medium capitalize ${getStabilityColor(data.forecast_stability)}`}>
                  {data.forecast_stability ?? '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Decision outcome */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-1">Selected Region</p>
              <p className="text-lg font-bold text-emerald-400 font-mono">{data.selectedRegion}</p>
            </div>
            <div className="bg-slate-800/40 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-1">Carbon Intensity</p>
              <p className="text-lg font-bold text-white">{data.carbonIntensity}</p>
              <p className="text-xs text-slate-500">gCO₂/kWh</p>
            </div>
            <div className="bg-slate-800/40 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-1">Carbon Delta</p>
              <p className="text-lg font-bold text-sky-400">+{data.carbon_delta_g_per_kwh}</p>
              <p className="text-xs text-slate-500">vs worst</p>
            </div>
            <div className="bg-slate-800/40 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-1">Score</p>
              <p className="text-lg font-bold text-white">{(data.score * 100).toFixed(1)}%</p>
            </div>
          </div>

          {/* Quality badge */}
          <div className="flex flex-wrap gap-2">
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${getQualityTierBadge(data.qualityTier)}`}>
              Quality: {data.qualityTier.toUpperCase()}
            </span>
            {data.estimatedFlag && (
              <span className="text-xs px-2 py-1 rounded-full font-medium bg-blue-500/10 border border-blue-500/20 text-blue-400">
                Estimated
              </span>
            )}
            {data.syntheticFlag && (
              <span className="text-xs px-2 py-1 rounded-full font-medium bg-purple-500/10 border border-purple-500/20 text-purple-400">
                Synthetic
              </span>
            )}
          </div>

          {/* Explanation */}
          {data.explanation && (
            <div className="bg-slate-800/30 rounded-lg p-3 border-l-2 border-emerald-500/40">
              <p className="text-xs text-slate-400 mb-1">Engine Explanation</p>
              <p className="text-sm text-slate-200">{data.explanation}</p>
            </div>
          )}

          {/* Signals table */}
          {Object.keys(data.signals).length > 0 && (
            <div>
              <p className="text-xs text-slate-400 mb-3">Carbon Signals Evaluated</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-600 border-b border-slate-800">
                      <th className="pb-2 font-medium">Region</th>
                      <th className="pb-2 font-medium text-right">Intensity</th>
                      <th className="pb-2 font-medium">Source</th>
                      <th className="pb-2 font-medium text-center">Fallback</th>
                      <th className="pb-2 font-medium text-center">Disagreement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {Object.entries(data.signals).map(([region, signal]) => (
                      <tr key={region} className={region === data.selectedRegion ? 'bg-emerald-500/5' : ''}>
                        <td className="py-2 font-mono font-medium text-white">{region}</td>
                        <td className="py-2 text-right text-emerald-400">{signal.intensity}</td>
                        <td className="py-2 text-slate-400">{signal.source}</td>
                        <td className="py-2 text-center">
                          {signal.fallbackUsed ? (
                            <span className="text-orange-400">yes</span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                        <td className="py-2 text-center">
                          {signal.disagreementFlag ? (
                            <AlertCircle className="w-3.5 h-3.5 text-red-400 inline" />
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Request context */}
          <div>
            <p className="text-xs text-slate-400 mb-2">Original Request</p>
            <div className="bg-slate-800/30 rounded-lg p-3 font-mono text-xs text-slate-400">
              <div className="flex gap-4 flex-wrap">
                <span>Regions: {data.request.regions.join(', ')}</span>
                {data.request.maxCarbonGPerKwh && (
                  <span>Max: {data.request.maxCarbonGPerKwh} gCO₂/kWh</span>
                )}
                <span>
                  Weights — carbon: {data.request.weights.carbon}, latency:{' '}
                  {data.request.weights.latency}, cost: {data.request.weights.cost}
                </span>
              </div>
              {data.referenceTime && (
                <div className="mt-1">refTime: {new Date(data.referenceTime).toISOString()}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
