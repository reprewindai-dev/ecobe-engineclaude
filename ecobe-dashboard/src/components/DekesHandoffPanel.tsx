'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { Activity, Link2, Loader2 } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { ecobeApi } from '@/lib/api'

function describeMessage(message: unknown) {
  if (!message) return 'No payload attached.'
  if (typeof message === 'string') return message
  if (typeof message === 'object') {
    const compact = JSON.stringify(message)
    return compact.length > 140 ? `${compact.slice(0, 137)}...` : compact
  }
  return String(message)
}

export function DekesHandoffPanel() {
  const summaryQ = useQuery({
    queryKey: ['dekes-integration-summary'],
    queryFn: () => ecobeApi.getDekesIntegrationSummary(),
    refetchInterval: 60_000,
    retry: 1,
  })

  const eventsQ = useQuery({
    queryKey: ['dekes-integration-events', 24],
    queryFn: () => ecobeApi.getDekesIntegrationEvents(24),
    refetchInterval: 30_000,
    retry: 1,
  })

  const isLoading = summaryQ.isLoading || eventsQ.isLoading
  const isError = summaryQ.isError && eventsQ.isError
  const summary = summaryQ.data
  const events = useMemo(() => eventsQ.data?.events ?? [], [eventsQ.data?.events])

  const chartData = useMemo(() => {
    const grouped = new Map<string, number>()
    for (const event of events) {
      grouped.set(event.type, (grouped.get(event.type) ?? 0) + 1)
    }
    return Array.from(grouped.entries()).map(([type, count]) => ({ type, count }))
  }, [events])

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 space-y-7">
      <div className="flex items-center gap-2">
        <Link2 className="h-5 w-5 text-emerald-400" />
        <div>
          <h3 className="text-lg font-semibold text-white">DEKES Activation Feed</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Live activation signals derived from routed DEKES decisions and engine state.
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
        </div>
      )}

      {isError && !isLoading && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/8 p-5 text-sm text-red-300">
          Unable to load the DEKES activation feed.
        </div>
      )}

      {!isLoading && !isError && summary && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <StatTile label="Connection" value={summary.status} accent="text-emerald-300" />
            <StatTile label="Successful workloads" value={String(summary.metrics.successfulWorkloads)} />
            <StatTile label="Last sync" value={formatDistanceToNow(parseISO(summary.lastSync), { addSuffix: true })} />
            <StatTile label="Event samples" value={String(eventsQ.data?.total ?? 0)} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
            <div className="rounded-xl border border-slate-800 bg-slate-950/65 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Recent event mix</p>
              <h4 className="mt-2 text-base font-semibold text-white">What the engine is sending</h4>

              {chartData.length === 0 ? (
                <div className="mt-6 rounded-lg border border-slate-800 bg-slate-950 px-4 py-8 text-center text-sm text-slate-500">
                  No recent DEKES integration events yet. The connection is healthy and waiting for signal-triggered activity.
                </div>
              ) : (
                <div className="mt-4 h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 0, left: 0, bottom: 16 }}>
                      <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="type" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} angle={-20} textAnchor="end" height={54} />
                      <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={26} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#020617',
                          border: '1px solid #1e293b',
                          borderRadius: 12,
                          color: '#e2e8f0',
                        }}
                      />
                      <Bar dataKey="count" fill="#17c7ff" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/65 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Recent events</p>
                  <h4 className="mt-2 text-base font-semibold text-white">Latest activation traffic</h4>
                </div>
                <Activity className="h-4 w-4 text-cyan-300" />
              </div>

              {events.length === 0 ? (
                <div className="mt-6 rounded-lg border border-slate-800 bg-slate-950 px-4 py-8 text-center text-sm text-slate-500">
                  No event payloads in the current time window.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {events.map((event) => (
                    <div key={event.id} className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
                              {event.type}
                            </span>
                            <span
                              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                                event.status === 'success'
                                  ? 'border border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
                                  : 'border border-red-400/20 bg-red-400/10 text-red-200'
                              }`}
                            >
                              {event.status}
                            </span>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-slate-300">{describeMessage(event.message)}</p>
                        </div>
                        <p className="text-xs text-slate-500">
                          {formatDistanceToNow(parseISO(event.timestamp), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: string
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/65 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className={`mt-3 text-2xl font-semibold ${accent ?? 'text-white'}`}>{value}</p>
    </div>
  )
}
