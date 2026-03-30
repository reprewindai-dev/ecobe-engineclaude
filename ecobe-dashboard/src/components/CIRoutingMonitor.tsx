'use client'

import { useQuery } from '@tanstack/react-query'
import { ecobeApi } from '@/lib/api'
import { Loader2, Server, Activity, CheckCircle, AlertTriangle, Leaf } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export function CIRoutingMonitor() {
  const { data: health, isLoading: healthLoading, isError: healthError } = useQuery({
    queryKey: ['ci-routing-health'],
    queryFn: () => ecobeApi.getCIRoutingHealth(),
    refetchInterval: 30_000,
  })

  const { data: regions, isLoading: regionsLoading } = useQuery({
    queryKey: ['ci-regions'],
    queryFn: () => ecobeApi.getCIAvailableRegions(),
    refetchInterval: 60_000,
  })

  const { data: decisions, isLoading: decisionsLoading } = useQuery({
    queryKey: ['ci-decisions'],
    queryFn: () => ecobeApi.getCIDecisions(20),
    refetchInterval: 30_000,
  })

  const isLoading = healthLoading || regionsLoading || decisionsLoading
  const regionList = regions?.regions ?? []
  const decisionList = decisions?.decisions ?? []

  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Leaf className="w-5 h-5 text-emerald-400" />
          Carbon-Aware CI/CD Routing
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">GitHub Actions runner optimization</p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
        </div>
      )}

      {healthError && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-sm text-red-400">CI routing service unavailable</p>
        </div>
      )}

      {!isLoading && !healthError && (
        <div className="space-y-4">
          {/* Health Status */}
          <div className="flex items-center justify-between p-4 bg-slate-800/40 rounded-lg">
            <div className="flex items-center gap-3">
              {health?.status === 'healthy' ? (
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
              )}
              <div>
                <p className="text-sm font-medium text-white">Service Status</p>
                <p className="text-xs text-slate-500">
                  Last checked {formatDistanceToNow(new Date(health?.timestamp || Date.now()))} ago
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className={`text-sm font-medium ${
                health?.status === 'healthy' ? 'text-emerald-400' : 'text-yellow-400'
              }`}>
                {health?.status || 'Unknown'}
              </span>
              <p className="text-xs text-slate-500">{regions?.totalRegions ?? regionList.length} regions</p>
            </div>
          </div>

          {/* Available Regions */}
          {regionList.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-white mb-3">Available Runner Regions</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {regionList.slice(0, 9).map((region: any) => (
                  <div key={region.region} className="p-2 bg-slate-800/40 rounded text-xs">
                    <p className="text-slate-300 font-medium">{region.region}</p>
                    <p className="text-slate-500">{region.runners?.length ?? 0} runners</p>
                  </div>
                ))}
                {regionList.length > 9 && (
                  <div className="p-2 bg-slate-800/40 rounded text-xs text-slate-500">
                    +{regionList.length - 9} more
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Recent Decisions */}
          {decisionList.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-white mb-3">Recent Routing Decisions</h4>
              <div className="space-y-2">
                {decisionList.slice(0, 5).map((decision: any) => (
                  <div key={decision.decisionFrameId} className="p-3 bg-slate-800/40 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Server className="w-4 h-4 text-slate-400" />
                        <div>
                          <p className="text-sm text-white">{decision.selectedRunner}</p>
                          <p className="text-xs text-slate-500">{decision.selectedRegion}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-emerald-400">{decision.carbonIntensity} gCO₂/kWh</p>
                        <p className="text-xs text-slate-500">
                          {decision.savings > 0 ? `-${decision.savings}%` : '0%'} vs baseline
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                      <Activity className="w-3 h-3" />
                      {decision.jobType}
                      <span>•</span>
                      {formatDistanceToNow(new Date(decision.createdAt))} ago
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Test Routing Info */}
          {health?.testRouting && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <p className="text-xs text-emerald-400">
                Test routing successful: {health.testRouting.carbonIntensity} gCO₂/kWh
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
