'use client'

import { useEffect, useState } from 'react'
import { Activity, AlertCircle, BarChart3, CheckCircle, RefreshCw, Zap } from 'lucide-react'

interface DksSummary {
  status: string
  integration: string
  lastSync: string
  metrics: {
    totalWorkloads: number
    successfulWorkloads: number
    successRate: number
    totalCO2Kg: number
    avgCO2PerWorkload: number
    timeRange: string
  }
}

interface DksMetrics {
  integration: string
  status: string
  timeRange: string
  metrics: {
    successRate: number
    failureRate: number
    totalEvents: number
    totalWorkloads: number
    avgResponseTimeMs: number
    uptime: number
  }
  hourlyTrend: Array<{
    hour: string
    requestCount: number
    avgCO2: number
  }>
  lastChecked: string
}

export default function DksIntegrationDashboard() {
  const [summary, setSummary] = useState<DksSummary | null>(null)
  const [metrics, setMetrics] = useState<DksMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const fetchIntegrationData = async () => {
    try {
      setLoading(true)
      setError(null)

      const [summaryResponse, metricsResponse] = await Promise.all([
        fetch('/api/integrations/dekes?endpoint=summary&days=30'),
        fetch('/api/integrations/dekes?endpoint=metrics&hours=168'),
      ])

      if (!summaryResponse.ok || !metricsResponse.ok) {
        throw new Error('Failed to fetch integration data')
      }

      const summaryData = await summaryResponse.json()
      const metricsData = await metricsResponse.json()

      if (summaryData.success) {
        setSummary(summaryData.data)
      }

      if (metricsData.success) {
        setMetrics(metricsData.data)
      }

      setLastRefresh(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchIntegrationData()

    const interval = setInterval(fetchIntegrationData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  if (loading && !summary && !metrics) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-300">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading DEKES integration data...</span>
      </div>
    )
  }

  if (error && !summary && !metrics) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-slate-900/60 p-6 text-red-300">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          <span>Failed to load DEKES integration data: {error}</span>
        </div>
      </div>
    )
  }

  const statusTone =
    summary?.status === 'healthy'
      ? 'text-emerald-300 border-emerald-500/20 bg-emerald-500/10'
      : summary?.status === 'degraded'
        ? 'text-amber-300 border-amber-500/20 bg-amber-500/10'
        : 'text-slate-300 border-slate-700 bg-slate-800/60'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-semibold text-white">DEKES Integration</h2>
          <p className="text-sm text-slate-400">
            Live ECOBE engine telemetry for routed DEKES workloads.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`rounded-full border px-3 py-1 text-xs font-medium ${statusTone}`}>
            {(summary?.status || 'unknown').toUpperCase()}
          </div>
          <button
            type="button"
            onClick={fetchIntegrationData}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {summary && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={<Activity className="h-4 w-4 text-sky-300" />}
            label="Total Workloads"
            value={summary.metrics.totalWorkloads.toLocaleString()}
            sub={`${summary.metrics.successRate}% success`}
          />
          <MetricCard
            icon={<CheckCircle className="h-4 w-4 text-emerald-300" />}
            label="Successful"
            value={summary.metrics.successfulWorkloads.toLocaleString()}
            sub={`Last ${summary.metrics.timeRange}`}
          />
          <MetricCard
            icon={<Zap className="h-4 w-4 text-cyan-300" />}
            label="Total CO2"
            value={`${summary.metrics.totalCO2Kg.toFixed(2)} kg`}
            sub="Reported workload emissions"
          />
          <MetricCard
            icon={<BarChart3 className="h-4 w-4 text-violet-300" />}
            label="Avg CO2 / Workload"
            value={`${summary.metrics.avgCO2PerWorkload.toFixed(3)} kg`}
            sub={`Sync ${new Date(summary.lastSync).toLocaleString()}`}
          />
        </div>
      )}

      {metrics && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Integration Health" description={`Operational metrics over ${metrics.timeRange}`}>
            <StatRow label="Success Rate" value={`${metrics.metrics.successRate}%`} />
            <StatRow label="Failure Rate" value={`${metrics.metrics.failureRate}%`} />
            <StatRow label="Total Events" value={metrics.metrics.totalEvents.toLocaleString()} />
            <StatRow label="Tracked Workloads" value={metrics.metrics.totalWorkloads.toLocaleString()} />
            <StatRow label="Avg Response Time" value={`${metrics.metrics.avgResponseTimeMs} ms`} />
            <StatRow label="Uptime" value={`${metrics.metrics.uptime}%`} />
          </Panel>

          <Panel title="Hourly Throughput" description="Recent routed workload activity">
            {metrics.hourlyTrend.length === 0 ? (
              <p className="text-sm text-slate-500">No recent throughput data available.</p>
            ) : (
              <div className="space-y-3">
                {metrics.hourlyTrend.slice(-8).reverse().map((point) => (
                  <div
                    key={point.hour}
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-white">{point.hour}</p>
                      <p className="text-xs text-slate-500">Average CO2 {point.avgCO2.toFixed(3)} kg</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-slate-200">{point.requestCount}</p>
                      <p className="text-xs text-slate-500">requests</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}

      <p className="text-center text-xs text-slate-500">
        Last refreshed {lastRefresh.toLocaleString()}
      </p>
    </div>
  )
}

function MetricCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm text-slate-400">{label}</span>
        {icon}
      </div>
      <p className="text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{sub}</p>
    </div>
  )
}

function Panel({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="text-sm text-slate-400">{description}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium text-slate-100">{value}</span>
    </div>
  )
}
