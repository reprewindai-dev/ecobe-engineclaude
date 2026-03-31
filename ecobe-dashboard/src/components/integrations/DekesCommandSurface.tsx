'use client'

import { useEffect, useState } from 'react'

type DekesSummary = {
  status: string
  integration: string
  lastSync: string
  metrics: {
    totalProspects: number
    qualifiedProspects: number
    totalHandoffs: number
    acceptedHandoffs: number
    routedHandoffs: number
    proofedHandoffs: number
    failedHandoffs: number
    totalWorkloads: number
    successfulWorkloads: number
    successRate: number
    totalCO2Kg: number
    avgCO2PerWorkload: number
    timeRange: string
  }
}

type DekesMetrics = {
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
}

type DekesHandoff = {
  id: string
  status: string
  qualificationScore: number | null
  externalLeadId: string | null
  createdAt: string
  updatedAt: string
  prospect: {
    id: string
    orgName: string | null
    orgDomain: string | null
    orgRegion: string | null
    intentScore: number | null
    status: string
  } | null
  decisionFrameId: string | null
  proofId: string | null
  action: string | null
  reasonCode: string | null
  selectedRegion: string | null
  selectedRunner: string | null
  carbonReductionPct: number | null
  waterImpactDeltaLiters: number | null
  latencyMs: { total?: number; compute?: number } | null
}

type DekesSignal = {
  id: string
  type: string
  success: boolean
  timestamp: string
  message: string | null
}

async function getPayload<T>(endpoint: string): Promise<T> {
  const response = await fetch(`/api/integrations/dekes?endpoint=${encodeURIComponent(endpoint)}`, {
    cache: 'no-store',
  })
  const data = await response.json()
  if (!response.ok || !data.success) {
    throw new Error(data.error || `Failed to load ${endpoint}`)
  }
  return data.data as T
}

function MetricTile({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
      <div className="mt-2 text-xs text-slate-400">{detail}</div>
    </div>
  )
}

export function DekesCommandSurface() {
  const [summary, setSummary] = useState<DekesSummary | null>(null)
  const [metrics, setMetrics] = useState<DekesMetrics | null>(null)
  const [handoffs, setHandoffs] = useState<DekesHandoff[]>([])
  const [signals, setSignals] = useState<DekesSignal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        setLoading(true)
        setError(null)
        const [summaryPayload, metricsPayload, handoffPayload, signalPayload] = await Promise.all([
          getPayload<DekesSummary>('summary'),
          getPayload<DekesMetrics>('metrics'),
          getPayload<{ handoffs: DekesHandoff[] }>('handoffs'),
          getPayload<{ signals: DekesSignal[] }>('signals'),
        ])

        if (cancelled) return
        setSummary(summaryPayload)
        setMetrics(metricsPayload)
        setHandoffs(handoffPayload.handoffs)
        setSignals(signalPayload.signals)
      } catch (loadError) {
        if (cancelled) return
        setError(loadError instanceof Error ? loadError.message : 'Failed to load DEKES loop')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    const timer = setInterval(() => void load(), 60_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  if (loading && !summary) {
    return (
      <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-8 text-sm text-slate-300">
        Loading the DEKES command surface...
      </div>
    )
  }

  if (error && !summary) {
    return (
      <div className="rounded-[32px] border border-rose-400/20 bg-rose-400/10 p-8 text-sm text-rose-200">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.16),transparent_36%),linear-gradient(180deg,rgba(5,10,20,0.96),rgba(2,8,18,0.98))] p-6 sm:p-8 lg:p-10">
        <div className="max-w-4xl">
          <div className="text-[11px] uppercase tracking-[0.28em] text-emerald-300">DEKES loop</div>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.05em] text-white sm:text-5xl">
            Buyer intelligence can now create real routed work.
          </h1>
          <p className="mt-5 max-w-3xl text-sm leading-8 text-slate-300 sm:text-base">
            This surface shows the closed loop instead of the old gap. Qualified prospects can
            produce routed workloads, decision proof, and visible operational signals back into the
            public product.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-xs text-slate-300">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
              status {summary?.status ?? 'unknown'}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
              {summary?.metrics.totalHandoffs ?? 0} handoffs
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
              {summary?.metrics.proofedHandoffs ?? 0} proofed
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
              {metrics?.metrics.avgResponseTimeMs ?? 0}ms average loop time
            </span>
          </div>
        </div>
      </section>

      {summary ? (
        <section className="grid gap-4 lg:grid-cols-4">
          <MetricTile
            label="Qualified prospects"
            value={summary.metrics.qualifiedProspects.toString()}
            detail={`${summary.metrics.totalProspects} prospects in ${summary.metrics.timeRange}`}
          />
          <MetricTile
            label="Handoffs"
            value={summary.metrics.totalHandoffs.toString()}
            detail={`${summary.metrics.acceptedHandoffs} accepted | ${summary.metrics.routedHandoffs} routed`}
          />
          <MetricTile
            label="Proofed workloads"
            value={summary.metrics.proofedHandoffs.toString()}
            detail={`${summary.metrics.successfulWorkloads} successful workloads`}
          />
          <MetricTile
            label="CO2 tracked"
            value={`${summary.metrics.totalCO2Kg.toFixed(2)} kg`}
            detail={`${summary.metrics.successRate}% workload success`}
          />
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
          <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">Recent handoffs</div>
          <h2 className="mt-2 text-2xl font-bold text-white">Qualified lead to proofed workload</h2>
          <div className="mt-5 space-y-3">
            {handoffs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/8 bg-white/[0.03] px-4 py-6 text-sm text-slate-400">
                No handoffs have been created yet.
              </div>
            ) : (
              handoffs.map((handoff) => (
                <article
                  key={handoff.id}
                  className="rounded-2xl border border-white/8 bg-white/[0.03] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {handoff.prospect?.orgName ?? handoff.externalLeadId ?? 'Unknown prospect'}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {handoff.prospect?.orgDomain ?? 'domain unavailable'} | {handoff.prospect?.orgRegion ?? 'region unavailable'}
                      </div>
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
                      {handoff.status}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 text-xs text-slate-300 sm:grid-cols-2 lg:grid-cols-4">
                    <div>Action: {handoff.action ?? 'pending'}</div>
                    <div>Region: {handoff.selectedRegion ?? 'pending'}</div>
                    <div>Carbon delta: {handoff.carbonReductionPct != null ? `${handoff.carbonReductionPct.toFixed(1)}%` : '--'}</div>
                    <div>Water delta: {handoff.waterImpactDeltaLiters != null ? `${handoff.waterImpactDeltaLiters.toFixed(2)} L` : '--'}</div>
                    <div>Latency: {handoff.latencyMs?.total != null ? `${handoff.latencyMs.total.toFixed(0)} ms` : '--'}</div>
                    <div>Proof ID: {handoff.proofId ?? 'awaiting proof'}</div>
                    <div>Decision frame: {handoff.decisionFrameId ?? 'awaiting routing'}</div>
                    <div>Qualification: {handoff.qualificationScore?.toFixed(0) ?? '--'}</div>
                  </div>
                  <div className="mt-3 text-xs text-slate-500">
                    {new Date(handoff.updatedAt).toLocaleString()} | {handoff.reasonCode ?? 'reason pending'}
                  </div>
                </article>
              ))
            )}
          </div>
        </div>

        <div className="space-y-6">
          <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
            <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">Loop health</div>
            <h2 className="mt-2 text-2xl font-bold text-white">Operational posture</h2>
            {metrics ? (
              <div className="mt-5 space-y-3 text-sm text-slate-300">
                <div className="flex items-center justify-between">
                  <span>Success rate</span>
                  <span className="font-semibold text-white">{metrics.metrics.successRate}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Failure rate</span>
                  <span className="font-semibold text-white">{metrics.metrics.failureRate}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Tracked workloads</span>
                  <span className="font-semibold text-white">{metrics.metrics.totalWorkloads}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Average response</span>
                  <span className="font-semibold text-white">{metrics.metrics.avgResponseTimeMs} ms</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Uptime</span>
                  <span className="font-semibold text-white">{metrics.metrics.uptime}%</span>
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
            <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">Recent signals</div>
            <h2 className="mt-2 text-2xl font-bold text-white">Integration events</h2>
            <div className="mt-5 space-y-3">
              {signals.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/8 bg-white/[0.03] px-4 py-6 text-sm text-slate-400">
                  No DEKES integration signals yet.
                </div>
              ) : (
                signals.map((signal) => (
                  <div key={signal.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-white">{signal.type}</div>
                      <div className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${signal.success ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
                        {signal.success ? 'ok' : 'issue'}
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">{new Date(signal.timestamp).toLocaleString()}</div>
                    <div className="mt-3 text-sm text-slate-300">{signal.message ?? 'No message payload recorded.'}</div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </section>
    </div>
  )
}
