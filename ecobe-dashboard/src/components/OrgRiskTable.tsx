'use client'

import { useQuery } from '@tanstack/react-query'
import { ecobeApi } from '@/lib/api'
import { Loader2, Users } from 'lucide-react'
import type { DekesHandoffEventType, HandoffClassification } from '@/types'

const BUDGET_STATUS_STYLES: Record<'ok' | 'warning' | 'exceeded', string> = {
  ok:       'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  warning:  'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  exceeded: 'bg-red-500/15 text-red-400 border border-red-500/30',
}

const CLASSIFICATION_STYLES: Record<HandoffClassification, string> = {
  opportunity:   'text-emerald-400',
  risk:          'text-red-400',
  informational: 'text-sky-400',
  no_action:     'text-slate-500',
}

const EVENT_LABELS: Partial<Record<DekesHandoffEventType, string>> = {
  BUDGET_WARNING:           'Budget Warning',
  BUDGET_EXCEEDED:          'Budget Exceeded',
  POLICY_DELAY:             'Policy Delay',
  POLICY_BLOCK:             'Policy Block',
  HIGH_CARBON_PATTERN:      'High Carbon',
  LOW_CONFIDENCE_REGION:    'Low Confidence',
  CLEAN_WINDOW_OPPORTUNITY: 'Clean Window',
}

export function OrgRiskTable() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dekes-integration-metrics'],
    queryFn: () => ecobeApi.getDekesIntegrationMetrics(),
    refetchInterval: 60_000,
    retry: 1,
  })

  // Sort by totalHandoffs desc, then by budget severity
  const orgRisks = [...(data?.orgRisks ?? [])].sort((a, b) => {
    const budgetOrder = { exceeded: 0, warning: 1, ok: 2 }
    if (budgetOrder[a.budgetStatus] !== budgetOrder[b.budgetStatus])
      return budgetOrder[a.budgetStatus] - budgetOrder[b.budgetStatus]
    return b.totalHandoffs - a.totalHandoffs
  })

  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Users className="w-5 h-5 text-emerald-400" />
        <div>
          <h3 className="text-lg font-semibold text-white">Org Risk &amp; Opportunity</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Organizations ranked by carbon-risk and DEKES activation signals
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
        </div>
      )}

      {isError && !isLoading && (
        <div className="py-8 text-center">
          <p className="text-sm text-slate-500">
            Connect ECOBE Engine to view org risk data
          </p>
          <p className="text-xs text-slate-600 mt-1">
            GET /api/v1/integrations/dekes/metrics
          </p>
        </div>
      )}

      {!isLoading && !isError && orgRisks.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-sm text-slate-500">No org risk data available yet</p>
          <p className="text-xs text-slate-600 mt-1">
            Data appears once DEKES handoff events are emitted per organization
          </p>
        </div>
      )}

      {orgRisks.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[11px] text-slate-500 border-b border-slate-800">
                <th className="pb-2.5 font-medium pr-4">Organization</th>
                <th className="pb-2.5 font-medium pr-4">Budget Status</th>
                <th className="pb-2.5 font-medium text-right pr-4">High-Carbon Events</th>
                <th className="pb-2.5 font-medium text-right pr-4">Policy Delays</th>
                <th className="pb-2.5 font-medium pr-4">Latest Handoff</th>
                <th className="pb-2.5 font-medium pr-4">DEKES Classification</th>
                <th className="pb-2.5 font-medium text-right">Total Handoffs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {orgRisks.map((org) => (
                <tr key={org.organizationId} className="hover:bg-slate-800/20 transition">
                  <td className="py-2.5 pr-4 font-mono text-slate-300 max-w-[120px] truncate">
                    {org.organizationId}
                  </td>
                  <td className="py-2.5 pr-4">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${BUDGET_STATUS_STYLES[org.budgetStatus]}`}
                    >
                      {org.budgetStatus.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono">
                    <span
                      className={
                        org.highCarbonPatternCount >= 5
                          ? 'text-orange-400 font-semibold'
                          : org.highCarbonPatternCount > 0
                            ? 'text-yellow-400'
                            : 'text-slate-500'
                      }
                    >
                      {org.highCarbonPatternCount}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono">
                    <span
                      className={
                        org.policyDelayCount > 3
                          ? 'text-orange-400 font-semibold'
                          : org.policyDelayCount > 0
                            ? 'text-yellow-400'
                            : 'text-slate-500'
                      }
                    >
                      {org.policyDelayCount}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4">
                    {org.latestHandoffType ? (
                      <span className="text-slate-400">
                        {EVENT_LABELS[org.latestHandoffType] ?? org.latestHandoffType}
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4">
                    {org.latestClassification ? (
                      <span
                        className={`font-medium capitalize ${CLASSIFICATION_STYLES[org.latestClassification]}`}
                      >
                        {org.latestClassification.replace('_', ' ')}
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="py-2.5 text-right font-mono text-white">
                    {org.totalHandoffs}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
