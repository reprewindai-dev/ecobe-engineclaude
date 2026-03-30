'use client'

import { latencyToneClass } from '@/lib/control-surface/labels'
import type { LiveSystemSnapshot } from '@/types/control-surface'

export function LatencyPanel({
  latency,
}: {
  latency: LiveSystemSnapshot['latency']
}) {
  return (
    <article className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
      <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-300">Latency</div>
      {!latency.available ? (
        <p className="mt-4 text-sm leading-7 text-slate-300">
          {latency.error ?? 'Latency metrics are unavailable.'}
        </p>
      ) : (
        <div className="mt-4 space-y-3 text-sm text-slate-300">
          <div className="flex items-center justify-between gap-3">
            <span>decision samples</span>
            <span className="font-semibold text-white">{latency.samples ?? 'n/a'}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>p95 total</span>
            <span className={`font-semibold ${latencyToneClass(latency.p95TotalMs)}`}>
              {latency.p95TotalMs == null ? 'n/a' : `${latency.p95TotalMs} ms`}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>p95 compute</span>
            <span className={`font-semibold ${latencyToneClass(latency.p95ComputeMs)}`}>
              {latency.p95ComputeMs == null ? 'n/a' : `${latency.p95ComputeMs} ms`}
            </span>
          </div>
          <div className="pt-2 text-xs text-slate-400">
            budget {latency.budgetTotalP95Ms ?? 'n/a'} / {latency.budgetComputeP95Ms ?? 'n/a'} ms
          </div>
        </div>
      )}
    </article>
  )
}
