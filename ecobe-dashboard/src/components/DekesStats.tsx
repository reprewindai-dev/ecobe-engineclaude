'use client'

import { useQuery } from '@tanstack/react-query'
import { ecobeApi } from '@/lib/api'
import { Loader2, TrendingDown, Activity, Database } from 'lucide-react'
import { format } from 'date-fns'

export function DekesStats() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dekes-analytics'],
    queryFn: () => ecobeApi.getDekesAnalytics(),
    refetchInterval: 60000, // Refresh every minute
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="bg-slate-900/50 rounded-lg border border-red-500/20 p-6">
        <p className="text-sm text-red-400">Error loading DEKES analytics</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-white mb-2">DEKES Workload Analytics</h3>
        <p className="text-slate-400">
          Monitor carbon savings from DEKES lead generation optimization
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-slate-400">Total Workloads</p>
            <Database className="w-5 h-5 text-emerald-500" />
          </div>
          <p className="text-3xl font-bold text-white">{data.totalWorkloads.toLocaleString()}</p>
          <p className="text-xs text-slate-500 mt-2">Optimized queries</p>
        </div>

        <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-slate-400">CO₂ Saved</p>
            <TrendingDown className="w-5 h-5 text-emerald-500" />
          </div>
          <p className="text-3xl font-bold text-emerald-400">
            {(data.totalCO2Saved / 1000).toFixed(2)}
            <span className="text-base font-normal text-slate-400 ml-2">kg</span>
          </p>
          <p className="text-xs text-slate-500 mt-2">vs. baseline</p>
        </div>

        <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-slate-400">Avg Carbon Intensity</p>
            <Activity className="w-5 h-5 text-emerald-500" />
          </div>
          <p className="text-3xl font-bold text-white">
            {data.averageCarbonIntensity}
            <span className="text-base font-normal text-slate-400 ml-2">gCO₂/kWh</span>
          </p>
          <p className="text-xs text-slate-500 mt-2">Across all workloads</p>
        </div>
      </div>

      {/* Recent Workloads */}
      <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-6">
        <h4 className="text-lg font-semibold text-white mb-4">Recent Workloads</h4>

        {data.workloads.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <p className="text-sm">No workloads yet</p>
            <p className="text-xs mt-1">DEKES queries will appear here once optimized</p>
          </div>
        ) : (
          <div className="space-y-2">
            {data.workloads.slice(0, 10).map((workload) => (
              <div
                key={workload.id}
                className="flex items-center justify-between p-4 bg-slate-800/30 rounded-lg hover:bg-slate-800/50 transition"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {workload.queryString}
                  </p>
                  <div className="flex items-center space-x-3 mt-1">
                    <span className="text-xs text-slate-500">{workload.dekesQueryId}</span>
                    <span className="text-xs text-slate-400">→ {workload.selectedRegion}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-4 ml-4">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-emerald-400">
                      {workload.actualCO2.toFixed(0)}
                    </p>
                    <p className="text-xs text-slate-500">gCO₂eq</p>
                  </div>

                  <div className="text-right">
                    <p
                      className={`text-xs px-2 py-1 rounded-full ${
                        workload.status === 'COMPLETED'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : workload.status === 'PENDING'
                          ? 'bg-yellow-500/10 text-yellow-400'
                          : 'bg-slate-700 text-slate-400'
                      }`}
                    >
                      {workload.status}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {format(new Date(workload.createdAt), 'MMM d, h:mm a')}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Environmental Impact */}
      <div className="bg-gradient-to-br from-emerald-500/10 to-teal-600/10 rounded-lg border border-emerald-500/20 p-6">
        <h4 className="text-lg font-semibold text-emerald-400 mb-3">Environmental Impact</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-300">
          <div>
            <p className="text-slate-400 mb-1">Equivalent to:</p>
            <ul className="space-y-1">
              <li>🌳 {(data.totalCO2Saved / 20000).toFixed(2)} trees planted</li>
              <li>🚗 {(data.totalCO2Saved / 404).toFixed(1)} miles not driven</li>
            </ul>
          </div>
          <div>
            <p className="text-slate-400 mb-1">By optimizing:</p>
            <ul className="space-y-1">
              <li>⚡ Workload placement based on grid carbon</li>
              <li>📅 Scheduling for low-carbon windows</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
