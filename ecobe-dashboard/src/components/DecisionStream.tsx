'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ecobeApi } from '@/lib/api'
import { getQualityTierBadge, getCarbonLevel } from '@/types'
import type { DashboardDecision, QualityTier } from '@/types'
import { Loader2, Radio, Filter, X } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { getDecisionSource, deriveQualityTier } from '@/lib/decisions'

// Collect unique filter values from the decisions list
function getFilterOptions(decisions: DashboardDecision[]) {
  const sources = new Set<string>()
  const orgs = new Set<string>()
  const workloadTypes = new Set<string>()

  for (const d of decisions) {
    sources.add(getDecisionSource(d))
    if (d.organizationId) orgs.add(d.organizationId)
    // Only include workload types from explicit meta.workloadType —
    // raw opName values are job IDs and pollute the filter dropdown.
    const wt = d.meta?.workloadType as string | undefined
    if (wt) workloadTypes.add(wt)
  }
  return { sources: Array.from(sources), orgs: Array.from(orgs), workloadTypes: Array.from(workloadTypes) }
}

interface Filters {
  source: string
  org: string
  workloadType: string
  qualityTier: QualityTier | ''
}

const BLANK: Filters = { source: '', org: '', workloadType: '', qualityTier: '' }

export function DecisionStream() {
  const [filters, setFilters] = useState<Filters>(BLANK)
  const [showFilters, setShowFilters] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['decisions', 200],
    queryFn: () => ecobeApi.getDecisions(200),
    refetchInterval: 15_000,
  })

  const decisions = data?.decisions ?? []
  const { sources, orgs, workloadTypes } = useMemo(() => getFilterOptions(decisions), [decisions])

  const filtered = useMemo(() => {
    return decisions.filter((d) => {
      if (filters.source && getDecisionSource(d) !== filters.source) return false
      if (filters.org && d.organizationId !== filters.org) return false
      if (filters.workloadType) {
        const wt = (d.meta?.workloadType as string) ?? d.opName ?? ''
        if (!wt.toLowerCase().includes(filters.workloadType.toLowerCase())) return false
      }
      if (filters.qualityTier && deriveQualityTier(d) !== filters.qualityTier) return false
      return true
    })
  }, [decisions, filters])

  const hasActiveFilter = Object.values(filters).some(Boolean)

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Radio className="w-4 h-4 text-emerald-400" />
          <h3 className="text-lg font-semibold text-white">Decision Stream</h3>
          {!isLoading && !isError && (
            <span className="text-xs text-slate-500">
              — {filtered.length}
              {hasActiveFilter && ` / ${decisions.length}`} decisions
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {hasActiveFilter && (
            <button
              onClick={() => setFilters(BLANK)}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition"
            >
              <X className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition ${
              showFilters || hasActiveFilter
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'border-slate-700 text-slate-500 hover:text-white'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            Filter
          </button>
          <div className="flex items-center space-x-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-slate-500">Live</span>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="mb-4 p-3 bg-slate-800/40 rounded-lg border border-slate-700/50 grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Source */}
          <div>
            <label className="text-[10px] text-slate-500 block mb-1">Source</label>
            <select
              value={filters.source}
              onChange={(e) => setFilter('source', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">All sources</option>
              {sources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Organization */}
          <div>
            <label className="text-[10px] text-slate-500 block mb-1">Organization</label>
            <select
              value={filters.org}
              onChange={(e) => setFilter('org', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">All orgs</option>
              {orgs.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          {/* Workload type */}
          <div>
            <label className="text-[10px] text-slate-500 block mb-1">Workload type</label>
            <select
              value={filters.workloadType}
              onChange={(e) => setFilter('workloadType', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">All types</option>
              {workloadTypes.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>

          {/* Quality tier */}
          <div>
            <label className="text-[10px] text-slate-500 block mb-1">Quality tier</label>
            <select
              value={filters.qualityTier}
              onChange={(e) => setFilter('qualityTier', e.target.value as QualityTier | '')}
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">All tiers</option>
              <option value="high">HIGH</option>
              <option value="medium">MEDIUM</option>
              <option value="low">LOW</option>
            </select>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
        </div>
      )}

      {isError && (
        <div className="py-6 text-center">
          <p className="text-sm text-slate-500">Connect ECOBE Engine to stream decisions</p>
        </div>
      )}

      {!isLoading && filtered.length === 0 && !isError && (
        <div className="py-6 text-center">
          <p className="text-sm text-slate-500">
            {hasActiveFilter ? 'No decisions match the current filters' : 'No routing decisions yet'}
          </p>
        </div>
      )}

      <div className="space-y-2 max-h-96 overflow-y-auto pr-1 custom-scrollbar">
        {filtered.map((d) => {
          const chosenIntensity = d.carbonIntensityChosenGPerKwh
          const baselineIntensity = d.carbonIntensityBaselineGPerKwh
          const delta =
            chosenIntensity != null && baselineIntensity != null
              ? Math.round(baselineIntensity - chosenIntensity)
              : null

          const tier = deriveQualityTier(d)
          const level = chosenIntensity != null ? getCarbonLevel(chosenIntensity) : null
          const source = getDecisionSource(d)
          const isDEKES = source === 'DEKES'

          return (
            <div
              key={d.id}
              className={`flex items-start gap-3 p-3 rounded-lg transition font-mono text-xs ${
                isDEKES
                  ? 'bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10'
                  : 'bg-slate-800/30 hover:bg-slate-800/50'
              }`}
            >
              {/* Timestamp */}
              <div className="w-16 flex-shrink-0 text-slate-500 mt-0.5">
                {new Date(d.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                })}{' '}
                UTC
              </div>

              {/* Main info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {d.workloadName && (
                    <span className="text-slate-300">
                      <span className="text-white">{d.workloadName}</span>
                    </span>
                  )}
                  <span className="text-slate-400">
                    {d.baselineRegion} →{' '}
                    <span className="text-emerald-400 font-semibold">{d.chosenRegion}</span>
                  </span>
                  {chosenIntensity != null && (
                    <span
                      className={
                        level === 'low'
                          ? 'text-emerald-400'
                          : level === 'medium'
                            ? 'text-yellow-400'
                            : 'text-red-400'
                      }
                    >
                      {chosenIntensity} gCO₂/kWh
                    </span>
                  )}
                  {delta != null && delta > 0 && <span className="text-sky-400">Δ{delta}</span>}
                </div>
                {d.reason && (
                  <p className="text-slate-600 mt-0.5 truncate">{d.reason}</p>
                )}
              </div>

              {/* Badges */}
              <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                {isDEKES && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                    DEKES
                  </span>
                )}
                {!isDEKES && source !== 'Manual' && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-400 text-[10px]">
                    {source}
                  </span>
                )}
                <span
                  className={`px-1.5 py-0.5 rounded text-xs font-medium ${getQualityTierBadge(tier)}`}
                >
                  {tier.toUpperCase()}
                </span>
                {d.fallbackUsed && (
                  <span className="px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/30 text-xs">
                    FALLBACK
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {decisions.length > 0 && (
        <p className="text-xs text-slate-600 mt-3 text-right">
          Last updated {formatDistanceToNow(new Date(decisions[0].createdAt))} ago
        </p>
      )}
    </div>
  )
}
