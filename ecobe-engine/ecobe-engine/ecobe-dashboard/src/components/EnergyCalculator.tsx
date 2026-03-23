'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ecobeApi, type EnergyEquationRequest } from '@/lib/api'
import { getCarbonLevel, getCarbonColor } from '@/types'
import { Loader2, CheckCircle } from 'lucide-react'

export function EnergyCalculator() {
  const [formData, setFormData] = useState<EnergyEquationRequest>({
    requestVolume: 1000,
    workloadType: 'inference',
    modelSize: 'mixtral-70b',
    regionTargets: ['US-CAL-CISO', 'FR', 'DE'],
    carbonBudget: 1000000,
  })

  const mutation = useMutation({
    mutationFn: (data: EnergyEquationRequest) => ecobeApi.calculateEnergyEquation(data),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate(formData)
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-white mb-2">Energy Equation Calculator</h3>
        <p className="text-slate-400">Calculate carbon footprint for your AI workloads.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">
                Request Volume
              </label>
              <input
                type="number"
                value={formData.requestVolume}
                onChange={(e) =>
                  setFormData({ ...formData, requestVolume: Number(e.target.value) })
                }
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">
                Workload Type
              </label>
              <select
                value={formData.workloadType}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    workloadType: e.target.value as 'inference' | 'training' | 'batch',
                  })
                }
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="inference">Inference</option>
                <option value="training">Training</option>
                <option value="batch">Batch Processing</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">Model Size</label>
              <select
                value={formData.modelSize || ''}
                onChange={(e) => setFormData({ ...formData, modelSize: e.target.value })}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="gpt-3.5">GPT-3.5 (Small)</option>
                <option value="claude-haiku">Claude Haiku (Medium)</option>
                <option value="mixtral-70b">Mixtral 70B (Large)</option>
                <option value="gpt-4">GPT-4 (XLarge)</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">
                Carbon Budget (gCO₂eq)
              </label>
              <input
                type="number"
                value={formData.carbonBudget || ''}
                onChange={(e) =>
                  setFormData({ ...formData, carbonBudget: Number(e.target.value) })
                }
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <button
              type="submit"
              disabled={mutation.isPending}
              className="w-full bg-emerald-500 text-white py-3 rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center space-x-2"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Calculating...</span>
                </>
              ) : (
                <span>Calculate Energy</span>
              )}
            </button>
          </form>
        </div>

        {/* Results */}
        <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-6">
          <h4 className="text-lg font-semibold text-white mb-4">Calculation Results</h4>

          {mutation.isPending && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
            </div>
          )}

          {mutation.isSuccess && mutation.data && (
            <div className="space-y-4">
              <div className="flex items-start space-x-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-emerald-400">Calculation Complete</p>
                  <p className="text-xs text-emerald-300/70 mt-1">
                    {mutation.data.withinBudget
                      ? 'Within carbon budget ✓'
                      : 'Exceeds carbon budget'}
                  </p>
                </div>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-4">
                <p className="text-xs text-slate-400 mb-2">Total Estimated CO₂</p>
                <p className="text-3xl font-bold text-white">
                  {mutation.data.totalEstimatedCO2.toLocaleString()}
                  <span className="text-base font-normal text-slate-400 ml-2">gCO₂eq</span>
                </p>
              </div>

              <div>
                <p className="text-sm font-medium text-slate-300 mb-3">
                  Recommended Regions (Ranked)
                </p>
                <div className="space-y-2">
                  {mutation.data.routingRecommendation.slice(0, 3).map((rec) => (
                    <div
                      key={rec.region}
                      className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg"
                    >
                      <div>
                        <p className="text-sm font-medium text-white">#{rec.rank} {rec.region}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Score: {(rec.score * 100).toFixed(0)}%
                        </p>
                      </div>
                      <div className="text-right">
                        <p
                          className={`text-sm font-semibold ${getCarbonColor(getCarbonLevel(rec.carbonIntensity))}`}
                        >
                          {rec.carbonIntensity} gCO₂/kWh
                        </p>
                        <p className="text-xs text-slate-500">{rec.estimatedCO2.toFixed(0)} gCO₂eq</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!mutation.isPending && !mutation.isSuccess && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <p className="text-sm">Enter workload parameters to calculate</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
