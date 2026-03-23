'use client'

import { useState, useEffect } from 'react'
import { ecobeApi } from '@/lib/api'
import type { GridSignalSummary, GridOpportunities, GridImportLeakage } from '@/types'

export function GridIntelligencePanel() {
  const [summary, setSummary] = useState<GridSignalSummary | null>(null)
  const [opportunities, setOpportunities] = useState<GridOpportunities | null>(null)
  const [leakage, setLeakage] = useState<GridImportLeakage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [s, o, l] = await Promise.all([
          ecobeApi.getGridSummary().catch(() => null),
          ecobeApi.getGridOpportunities().catch(() => null),
          ecobeApi.getGridImportLeakage().catch(() => null),
        ])
        setSummary(s)
        setOpportunities(o)
        setLeakage(l)
      } catch (err: any) {
        setError(err.message || 'Failed to load grid intelligence')
      } finally {
        setLoading(false)
      }
    }
    load()
    const interval = setInterval(load, 60_000) // refresh every 60s
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
        <p className="text-slate-500 text-sm">Loading grid intelligence…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Grid Summary Table */}
      <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">
          Grid Signal Summary
          <span className="ml-2 text-xs text-slate-500 font-normal">
            Lowest Defensible Signal · EIA-930 Telemetry
          </span>
        </h3>
        {summary && summary.regions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800">
                  <th className="text-left py-2 pr-3">Region</th>
                  <th className="text-left py-2 pr-3">BA</th>
                  <th className="text-right py-2 pr-3">Demand Ramp %</th>
                  <th className="text-right py-2 pr-3">Renewable %</th>
                  <th className="text-right py-2 pr-3">Fossil %</th>
                  <th className="text-right py-2 pr-3">Carbon Spike Prob</th>
                  <th className="text-right py-2 pr-3">Curtailment Prob</th>
                  <th className="text-right py-2 pr-3">Import Leakage</th>
                  <th className="text-center py-2">Quality Tier</th>
                </tr>
              </thead>
              <tbody>
                {summary.regions.map((r) => (
                  <tr key={r.region} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="py-2 pr-3 font-mono text-slate-200">{r.region}</td>
                    <td className="py-2 pr-3 text-slate-400">{r.balancingAuthority ?? '—'}</td>
                    <td className="py-2 pr-3 text-right text-slate-300">
                      {r.demandRampPct != null ? `${r.demandRampPct.toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-2 pr-3 text-right text-emerald-400">
                      {r.renewableRatio != null ? `${(r.renewableRatio * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-2 pr-3 text-right text-orange-400">
                      {r.fossilRatio != null ? `${(r.fossilRatio * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <span className={r.carbonSpikeProbability != null && r.carbonSpikeProbability > 0.7 ? 'text-red-400' : 'text-slate-300'}>
                        {r.carbonSpikeProbability != null ? `${(r.carbonSpikeProbability * 100).toFixed(0)}%` : '—'}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <span className={r.curtailmentProbability != null && r.curtailmentProbability > 0.6 ? 'text-emerald-400' : 'text-slate-300'}>
                        {r.curtailmentProbability != null ? `${(r.curtailmentProbability * 100).toFixed(0)}%` : '—'}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <span className={r.importCarbonLeakageScore != null && r.importCarbonLeakageScore > 0.5 ? 'text-yellow-400' : 'text-slate-300'}>
                        {r.importCarbonLeakageScore != null ? r.importCarbonLeakageScore.toFixed(2) : '—'}
                      </span>
                    </td>
                    <td className="py-2 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${
                        r.signalQuality === 'high' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
                        r.signalQuality === 'medium' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30' :
                        'bg-red-500/10 text-red-400 border border-red-500/30'
                      }`}>
                        {r.signalQuality.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-slate-500 text-xs">No grid signal data available. EIA-930 ingestion may be pending.</p>
        )}
      </div>

      {/* Opportunities */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Curtailment Windows */}
        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
          <h3 className="text-sm font-semibold text-emerald-400 mb-3">Curtailment Opportunities</h3>
          {opportunities?.topCurtailmentWindows && opportunities.topCurtailmentWindows.length > 0 ? (
            <div className="space-y-2">
              {opportunities.topCurtailmentWindows.map((w, i) => (
                <div key={i} className="flex items-center justify-between text-xs bg-slate-800/50 rounded p-2">
                  <div>
                    <span className="font-mono text-slate-200">{w.region}</span>
                    <span className="ml-2 text-slate-500">
                      {new Date(w.startTime).toLocaleTimeString()} — {new Date(w.endTime).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-emerald-400">
                      Curtailment Probability: {(w.curtailmentProbability * 100).toFixed(0)}%
                    </span>
                    {w.expectedCarbonIntensity != null && (
                      <span className="text-slate-400">{w.expectedCarbonIntensity.toFixed(0)} gCO₂/kWh</span>
                    )}
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                      w.confidence === 'high' ? 'bg-emerald-500/10 text-emerald-400' :
                      w.confidence === 'medium' ? 'bg-yellow-500/10 text-yellow-400' :
                      'bg-red-500/10 text-red-400'
                    }`}>
                      {w.confidence}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-xs">No curtailment windows detected</p>
          )}
        </div>

        {/* Carbon Spike Risks */}
        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
          <h3 className="text-sm font-semibold text-red-400 mb-3">Carbon Spike Risks</h3>
          {opportunities?.topCarbonSpikeRisks && opportunities.topCarbonSpikeRisks.length > 0 ? (
            <div className="space-y-2">
              {opportunities.topCarbonSpikeRisks.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-xs bg-slate-800/50 rounded p-2">
                  <div>
                    <span className="font-mono text-slate-200">{r.region}</span>
                    {r.balancingAuthority && (
                      <span className="ml-2 text-slate-500">{r.balancingAuthority}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-red-400">
                      Carbon Spike Probability: {(r.carbonSpikeProbability * 100).toFixed(0)}%
                    </span>
                    {r.expectedRampPct != null && (
                      <span className="text-slate-400">Ramp: {r.expectedRampPct.toFixed(1)}%</span>
                    )}
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                      r.confidence === 'high' ? 'bg-emerald-500/10 text-emerald-400' :
                      r.confidence === 'medium' ? 'bg-yellow-500/10 text-yellow-400' :
                      'bg-red-500/10 text-red-400'
                    }`}>
                      {r.confidence}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-xs">No carbon spike risks detected</p>
          )}
        </div>
      </div>

      {/* Import Carbon Leakage */}
      <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
        <h3 className="text-sm font-semibold text-yellow-400 mb-3">
          Import Carbon Leakage
          <span className="ml-2 text-xs text-slate-500 font-normal">Cross-border flow analysis</span>
        </h3>
        {leakage?.topImportLeakages && leakage.topImportLeakages.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800">
                  <th className="text-left py-2 pr-3">Region</th>
                  <th className="text-right py-2 pr-3">Import Volume (MWh)</th>
                  <th className="text-right py-2 pr-3">Leakage Score</th>
                  <th className="text-right py-2 pr-3">Neighbor CI</th>
                  <th className="text-right py-2 pr-3">Local CI</th>
                  <th className="text-center py-2 pr-3">Confidence</th>
                  <th className="text-center py-2">Data Source</th>
                </tr>
              </thead>
              <tbody>
                {leakage.topImportLeakages.map((l, i) => (
                  <tr key={i} className="border-b border-slate-800/50">
                    <td className="py-2 pr-3 font-mono text-slate-200">{l.region}</td>
                    <td className="py-2 pr-3 text-right text-slate-300">
                      {l.importVolumeMwh.toFixed(0)}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <span className={l.leakageScore > 0.5 ? 'text-yellow-400' : 'text-slate-300'}>
                        {l.leakageScore.toFixed(3)}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right text-slate-400">
                      {l.neighborCarbonIntensity != null ? `${l.neighborCarbonIntensity.toFixed(0)} g` : '—'}
                    </td>
                    <td className="py-2 pr-3 text-right text-slate-400">
                      {l.localCarbonIntensity != null ? `${l.localCarbonIntensity.toFixed(0)} g` : '—'}
                    </td>
                    <td className="py-2 pr-3 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                        l.confidence === 'high' ? 'bg-emerald-500/10 text-emerald-400' :
                        l.confidence === 'medium' ? 'bg-yellow-500/10 text-yellow-400' :
                        'bg-red-500/10 text-red-400'
                      }`}>
                        {l.confidence}
                      </span>
                    </td>
                    <td className="py-2 text-center">
                      {l.isHeuristicOnly ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/30">
                          Estimated
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          Provider
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-slate-500 text-xs">No import carbon leakage data available</p>
        )}
      </div>
    </div>
  )
}
