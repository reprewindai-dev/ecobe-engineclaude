'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Activity, Database, Loader2, ShieldCheck, TrendingDown } from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { ecobeApi } from '@/lib/api'

function formatHourLabel(hour: string) {
  return format(new Date(`${hour}:00Z`), 'MMM d, h a')
}

export function DekesStats() {
  const summaryQ = useQuery({
    queryKey: ['dekes-integration-summary'],
    queryFn: () => ecobeApi.getDekesIntegrationSummary(),
    refetchInterval: 60_000,
    retry: 1,
  })

  const metricsQ = useQuery({
    queryKey: ['dekes-integration-metrics'],
    queryFn: () => ecobeApi.getDekesIntegrationMetrics(),
    refetchInterval: 60_000,
    retry: 1,
  })

  const isLoading = summaryQ.isLoading || metricsQ.isLoading
  const isError = summaryQ.isError && metricsQ.isError

  const summary = summaryQ.data
  const metrics = metricsQ.data

  const trendData = useMemo(
    () =>
      (metrics?.hourlyTrend ?? []).map((point) => ({
        ...point,
        label: formatHourLabel(point.hour),
      })),
    [metrics?.hourlyTrend]
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    )
  }

  if (isError || !summary || !metrics) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/8 p-6">
        <p className="text-sm text-red-300">Unable to load DEKES integration telemetry.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 className="text-xl font-semibold text-white">DEKES Runtime Telemetry</h3>
          <p className="text-sm text-slate-400">
            Read-model telemetry built from live DEKES routing decisions and engine health.
          </p>
        </div>
        <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">
          {summary.metrics.timeRange} window
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total workloads"
          value={summary.metrics.totalWorkloads.toLocaleString()}
          detail="DEKES searches routed through the carbon engine."
          icon={Database}
        />
        <MetricCard
          label="Success rate"
          value={`${summary.metrics.successRate}%`}
          detail="Routed DEKES workloads represented in the current decision window."
          icon={ShieldCheck}
        />
        <MetricCard
          label="Total CO2"
          value={`${summary.metrics.totalCO2Kg.toFixed(1)} kg`}
          detail="Actual emissions observed across DEKES runtime output."
          icon={TrendingDown}
        />
        <MetricCard
          label="Avg per workload"
          value={`${summary.metrics.avgCO2PerWorkload.toFixed(2)} kg`}
          detail="Average carbon load per routed DEKES workload."
          icon={Activity}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Live workload rhythm</p>
              <h4 className="mt-2 text-lg font-semibold text-white">Requests and carbon intensity by hour</h4>
            </div>
            <div className="text-right text-xs text-slate-500">
              <div>Uptime {metrics.metrics.uptime}%</div>
              <div>Failure rate {metrics.metrics.failureRate}%</div>
            </div>
          </div>

          {trendData.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-6 text-sm text-slate-400">
              No recent hourly workload samples yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trendData} margin={{ left: 0, right: 0, top: 12, bottom: 0 }}>
                <defs>
                  <linearGradient id="dekesRequests" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#17c7ff" stopOpacity={0.55} />
                    <stop offset="95%" stopColor="#17c7ff" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="dekesCarbon" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1ef0c1" stopOpacity={0.42} />
                    <stop offset="95%" stopColor="#1ef0c1" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={18}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                  allowDecimals={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#020617',
                    border: '1px solid #1e293b',
                    borderRadius: 12,
                    color: '#e2e8f0',
                  }}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="requestCount"
                  stroke="#17c7ff"
                  fill="url(#dekesRequests)"
                  strokeWidth={2.5}
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="avgCO2"
                  stroke="#1ef0c1"
                  fill="url(#dekesCarbon)"
                  strokeWidth={2.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Integration health</p>
          <h4 className="mt-2 text-lg font-semibold text-white">Operational readout</h4>

          <div className="mt-5 space-y-3">
            <ReadoutRow
              label="Status"
              value={metrics.status}
              accent={metrics.status === 'healthy' ? 'text-emerald-300' : 'text-yellow-300'}
            />
            <ReadoutRow label="Events processed" value={String(metrics.metrics.totalEvents)} />
            <ReadoutRow label="Avg response" value={`${Math.round(metrics.metrics.avgResponseTimeMs)} ms`} />
            <ReadoutRow label="Last checked" value={format(new Date(metrics.lastChecked), 'MMM d, h:mm a')} />
          </div>
        </div>
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string
  value: string
  detail: string
  icon: typeof Database
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">{label}</p>
        <Icon className="h-5 w-5 text-emerald-400" />
      </div>
      <p className="mt-3 text-3xl font-bold text-white">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  )
}

function ReadoutRow({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: string
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/65 px-4 py-3">
      <p className="text-sm text-slate-400">{label}</p>
      <p className={`text-sm font-semibold ${accent ?? 'text-white'}`}>{value}</p>
    </div>
  )
}
