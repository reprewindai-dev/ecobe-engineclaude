'use client'

import { useLiveSystemSnapshot } from '@/lib/hooks/control-surface'
import { GovernancePanel } from './GovernancePanel'
import { LatencyPanel } from './LatencyPanel'
import { ProviderVerificationPanel } from './ProviderVerificationPanel'
import { RecentDecisionsList } from './RecentDecisionsList'
import { TraceLedgerPanel } from './TraceLedgerPanel'

export function LiveSystemSection() {
  const liveSystemQuery = useLiveSystemSnapshot()

  if (liveSystemQuery.isLoading) {
    return (
      <section className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
        <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-300">Live System</div>
        <div className="mt-4 text-sm text-slate-300">Loading real system state…</div>
      </section>
    )
  }

  if (liveSystemQuery.error || !liveSystemQuery.data) {
    return (
      <section className="rounded-[32px] border border-rose-400/20 bg-rose-400/10 p-6 sm:p-8">
        <div className="text-[11px] uppercase tracking-[0.28em] text-rose-200">Live System</div>
        <div className="mt-4 text-sm text-rose-100">
          {liveSystemQuery.error instanceof Error
            ? liveSystemQuery.error.message
            : 'Failed to load live system state.'}
        </div>
      </section>
    )
  }

  const snapshot = liveSystemQuery.data

  return (
    <section className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
      <div className="max-w-3xl">
        <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-300">Live System</div>
        <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl">
          Real execution authority. Real trace. Real replay.
        </h2>
        <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-base">
          This section is bound to live engine outputs. It exposes recent decisions, trace and
          replay posture, SAIQ governance state, verified water datasets, and the current p95
          latency window.
        </p>
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
