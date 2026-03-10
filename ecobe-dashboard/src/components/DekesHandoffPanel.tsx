'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ecobeApi } from '@/lib/api'
import { Loader2, Link2, ChevronRight } from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import type {
  DekesHandoff,
  DekesHandoffEventType,
  HandoffSeverity,
  HandoffStatus,
  HandoffClassification,
} from '@/types'
import { HandoffDetailDrawer } from '@/components/HandoffDetailDrawer'

// ── UI constants ──────────────────────────────────────────────────────────────

const EVENT_TYPE_CONFIG: Record<DekesHandoffEventType, { label: string; color: string }> = {
  BUDGET_WARNING:              { label: 'Budget Warning',      color: '#f59e0b' },
  BUDGET_EXCEEDED:             { label: 'Budget Exceeded',     color: '#ef4444' },
  POLICY_DELAY:                { label: 'Policy Delay',        color: '#eab308' },
  POLICY_BLOCK:                { label: 'Policy Block',        color: '#f97316' },
  HIGH_CARBON_PATTERN:         { label: 'High Carbon',         color: '#f97316' },
  LOW_CONFIDENCE_REGION:       { label: 'Low Confidence',      color: '#64748b' },
  CLEAN_WINDOW_OPPORTUNITY:    { label: 'Clean Window',        color: '#10b981' },
  PROVIDER_DISAGREEMENT_ALERT: { label: 'Provider Disagree',   color: '#8b5cf6' },
  EXECUTION_DRIFT_RISK:        { label: 'Drift Risk',          color: '#06b6d4' },
  ROUTING_POLICY_INSIGHT:      { label: 'Policy Insight',      color: '#94a3b8' },
}

const SEVERITY_STYLES: Record<HandoffSeverity, string> = {
  critical: 'bg-red-500/15 text-red-400 border border-red-500/30',
  high:     'bg-orange-500/15 text-orange-400 border border-orange-500/30',
  medium:   'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  low:      'bg-slate-700/60 text-slate-400 border border-slate-600/30',
}

const STATUS_STYLES: Record<HandoffStatus, string> = {
  queued:     'bg-sky-500/15 text-sky-400',
  processing: 'bg-purple-500/15 text-purple-400',
  processed:  'bg-emerald-500/15 text-emerald-400',
  ignored:    'bg-slate-700/60 text-slate-500',
  failed:     'bg-red-500/15 text-red-400',
}

const CLASSIFICATION_STYLES: Record<HandoffClassification, string> = {
  opportunity:    'text-emerald-400',
  risk:           'text-red-400',
  informational:  'text-sky-400',
  no_action:      'text-slate-500',
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

interface ChartTooltipProps {
  active?: boolean
  payload?: Array<{ value: number; payload: { label: string } }>
  label?: string
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs">
      <p className="font-semibold text-white mb-0.5">{payload[0]?.payload.label ?? label}</p>
      <p className="text-slate-300">{payload[0]?.value} events</p>
    </div>
  )
}

// ── Summary stat tile ─────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: number | string
  sub?: string
  accent?: string
}) {
  return (
    <div className="bg-slate-800/40 rounded-lg p-3">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent ?? 'text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function DekesHandoffPanel() {
  const [selectedHandoff, setSelectedHandoff] = useState<DekesHandoff | null>(null)

  const summaryQ = useQuery({
    queryKey: ['dekes-integration-summary'],
    queryFn: () => ecobeApi.getDekesIntegrationSummary(),
    refetchInterval: 60_000,
    retry: 1,
  })

  const eventsQ = useQuery({
    queryKey: ['dekes-integration-events', 50],
    queryFn: () => ecobeApi.getDekesIntegrationEvents(50),
    refetchInterval: 30_000,
    retry: 1,
  })

  const summary = summaryQ.data
  const handoffs = eventsQ.data?.handoffs ?? []
  const isLoading = summaryQ.isLoading || eventsQ.isLoading
  const isError = summaryQ.isError && eventsQ.isError

  // Build chart data from byEventType map
  const chartData = summary
    ? Object.entries(summary.byEventType)
        .filter(([, count]) => count > 0)
        .map(([eventType, count]) => ({
          eventType: eventType as DekesHandoffEventType,
          label: EVENT_TYPE_CONFIG[eventType as DekesHandoffEventType]?.label ?? eventType,
          count,
          color: EVENT_TYPE_CONFIG[eventType as DekesHandoffEventType]?.color ?? '#64748b',
        }))
        .sort((a, b) => b.count - a.count)
    : []

  return (
    <>
      <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 space-y-7">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Link2 className="w-5 h-5 text-emerald-400" />
          <div>
            <h3 className="text-lg font-semibold text-white">DEKES Integration</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Handoff events emitted by CO₂ Router → consumed by DEKES as business-activation
              signals. Carbon-decision truth path is unaffected.
            </p>
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
          </div>
        )}

        {/* Error */}
        {isError && !isLoading && (
          <div className="py-10 text-center">
            <p className="text-sm text-slate-500">Connect ECOBE Engine to view integration data</p>
            <p className="text-xs text-slate-600 mt-1">
              GET /api/v1/integrations/dekes/summary
            </p>
          </div>
        )}

        {/* Empty */}
        {!isLoading && !isError && summary && summary.total === 0 && (
          <div className="py-10 text-center">
            <p className="text-sm text-slate-500">
              No DEKES handoff events yet
            </p>
            <p className="text-xs text-slate-600 mt-1">
              Events are emitted when budget / policy thresholds are crossed
            </p>
          </div>
        )}

        {summary && summary.total > 0 && (
          <>
            {/* ── Section A — Handoff Summary ── */}
            <section>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Handoff Summary
              </p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <StatTile label="Total" value={summary.total} />
                <StatTile label="Queued" value={summary.queued} accent="text-sky-400" />
                <StatTile label="Processed" value={summary.processed} accent="text-emerald-400" />
                <StatTile
                  label="Failed"
                  value={summary.failed}
                  accent={summary.failed > 0 ? 'text-red-400' : 'text-slate-500'}
                />
                <StatTile label="Ignored" value={summary.ignored} accent="text-slate-500" />
              </div>
            </section>

            {/* ── Section B — Event Type Breakdown ── */}
            {chartData.length > 0 && (
              <section>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  Event Type Breakdown
                </p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart
                    data={chartData}
                    margin={{ top: 4, right: 4, bottom: 24, left: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: '#64748b', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      angle={-25}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis
                      tick={{ fill: '#475569', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      width={28}
                      allowDecimals={false}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: '#1e293b' }} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} fillOpacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </section>
            )}

            {/* ── Section D — Business Activation Metrics ── */}
            <section>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Business Activation
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatTile
                  label="Opportunities"
                  value={summary.opportunitiesGenerated}
                  accent="text-emerald-400"
                  sub="generated by DEKES"
                />
                <StatTile
                  label="Actions Created"
                  value={summary.actionsCreated}
                  accent="text-sky-400"
                  sub="in DEKES workflows"
                />
                <StatTile
                  label="High-Priority Orgs"
                  value={summary.highPriorityOrgs}
                  accent={summary.highPriorityOrgs > 0 ? 'text-orange-400' : 'text-slate-500'}
                  sub="flagged"
                />
                <StatTile
                  label="Avg Latency"
                  value={
                    summary.avgProcessingLatencyMs != null
                      ? `${(summary.avgProcessingLatencyMs / 1000).toFixed(1)}s`
                      : '—'
                  }
                  sub="handoff → processed"
                />
              </div>
            </section>

            {/* ── Section C — Recent Handoffs Table ── */}
            {handoffs.length > 0 && (
              <section>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  Recent Handoffs
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-[11px] text-slate-500 border-b border-slate-800">
                        <th className="pb-2 font-medium pr-4">Time</th>
                        <th className="pb-2 font-medium pr-4">Org</th>
                        <th className="pb-2 font-medium pr-4">Event</th>
                        <th className="pb-2 font-medium pr-4">Sev</th>
                        <th className="pb-2 font-medium text-right pr-4">Carbon Δ</th>
                        <th className="pb-2 font-medium pr-4">Status</th>
                        <th className="pb-2 font-medium pr-4">Classification</th>
                        <th className="pb-2 font-medium w-6" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {handoffs.map((h) => {
                        const cfg = EVENT_TYPE_CONFIG[h.eventType]
                        return (
                          <tr
                            key={h.handoffId}
                            onClick={() => setSelectedHandoff(h)}
                            className="hover:bg-slate-800/30 cursor-pointer transition"
                          >
                            <td className="py-2.5 pr-4 font-mono text-slate-400 whitespace-nowrap">
                              {formatDistanceToNow(parseISO(h.timestamp), { addSuffix: true })}
                            </td>
                            <td className="py-2.5 pr-4 font-mono text-slate-300 max-w-[96px] truncate">
                              {h.organizationId}
                            </td>
                            <td className="py-2.5 pr-4">
                              <span
                                className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                style={{
                                  backgroundColor: (cfg?.color ?? '#64748b') + '20',
                                  color: cfg?.color ?? '#94a3b8',
                                  border: `1px solid ${(cfg?.color ?? '#64748b')}40`,
                                }}
                              >
                                {cfg?.label ?? h.eventType}
                              </span>
                            </td>
                            <td className="py-2.5 pr-4">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${SEVERITY_STYLES[h.severity]}`}
                              >
                                {h.severity.toUpperCase()}
                              </span>
                            </td>
                            <td className="py-2.5 pr-4 text-right font-mono">
                              {h.routing?.carbonDeltaGPerKwh != null ? (
                                <span className="text-sky-400">
                                  +{h.routing.carbonDeltaGPerKwh} g/kWh
                                </span>
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>
                            <td className="py-2.5 pr-4">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_STYLES[h.status]}`}
                              >
                                {h.status}
                              </span>
                            </td>
                            <td className="py-2.5 pr-4">
                              {h.dekesClassification ? (
                                <span
                                  className={`text-[11px] font-medium capitalize ${CLASSIFICATION_STYLES[h.dekesClassification]}`}
                                >
                                  {h.dekesClassification.replace('_', ' ')}
                                </span>
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>
                            <td className="py-2.5 text-slate-600">
                              <ChevronRight className="w-3.5 h-3.5" />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-600 text-right mt-2">
                  {handoffs.length} handoffs shown · data from ECOBE engine · click row for detail
                </p>
              </section>
            )}
          </>
        )}
      </div>

      {/* Drawer — rendered outside the panel card so it can overlay the full page */}
      <HandoffDetailDrawer
        handoff={selectedHandoff}
        onClose={() => setSelectedHandoff(null)}
      />
    </>
  )
}
