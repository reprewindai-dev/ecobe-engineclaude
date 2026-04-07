'use client'

import type { LiveSystemSnapshot } from '@/types/control-surface'
import { GovernancePanel } from './GovernancePanel'
import { LatencyPanel } from './LatencyPanel'
import { ProviderVerificationPanel } from './ProviderVerificationPanel'
import { RecentDecisionsList } from './RecentDecisionsList'
import { TraceLedgerPanel } from './TraceLedgerPanel'

export function LiveSystemSection({
  snapshot,
  liveStatus,
}: {
  snapshot: LiveSystemSnapshot
  liveStatus: {
    lastUpdatedLabel: string
    detail: string
  }
}) {

  return (
    <section className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
      <div className="max-w-3xl">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-300">Live System</div>
          <div className="rounded-full border border-emerald-400/20 bg-emerald-400/8 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
            live mirror
          </div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
            updated {liveStatus.lastUpdatedLabel}
          </div>
        </div>
        <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl">
          Real execution authority. Real trace. Real replay.
        </h2>
        <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-base">
          This section is bound to a public live mirror. It exposes recent decisions, trace and
          replay posture, governance state, verified provider posture, and the current p95 latency
          window without loading the operator console on the homepage.
        </p>
        <div className="mt-4 rounded-2xl border border-cyan-300/16 bg-cyan-300/8 px-4 py-3 text-sm text-cyan-100">
          {liveStatus.detail}
        </div>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <RecentDecisionsList decisions={snapshot.recentDecisions} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TraceLedgerPanel traceLedger={snapshot.traceLedger} />
          <GovernancePanel governance={snapshot.governance} />
          <ProviderVerificationPanel providers={snapshot.providers} />
          <LatencyPanel latency={snapshot.latency} />
        </div>
      </div>
    </section>
  )
}
