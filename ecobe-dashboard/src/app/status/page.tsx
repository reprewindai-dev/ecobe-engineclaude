import type { Metadata } from 'next'

import { GovernancePanel } from '@/components/landing/GovernancePanel'
import { LatencyPanel } from '@/components/landing/LatencyPanel'
import { RecentDecisionsList } from '@/components/landing/RecentDecisionsList'
import { InformationPageShell } from '@/components/site/InformationPageShell'
import { getLiveSystemSnapshot } from '@/lib/control-surface/live-system'
import { createPageMetadata } from '@/lib/seo'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createPageMetadata({
  title: 'Status',
  description:
    'Operational scan for live latency, recency, governance state, recent frames, and trust indicators across the CO2 Router control plane.',
  path: '/status',
  keywords: ['system status', 'decision latency', 'governance status', 'operational posture'],
})

export default async function StatusPage() {
  const snapshot = await getLiveSystemSnapshot()
  const latestDecision = snapshot.recentDecisions.items[0] ?? null
  const verifiedDatasets = snapshot.providers.datasets.filter(
    (dataset) => dataset.verificationStatus === 'verified'
  ).length

  return (
    <InformationPageShell
      eyebrow="Status"
      title="Operational scan for the live execution control plane."
      summary="Status is the fast read surface. Use it to scan live health, recent frames, latency posture, and concise trust indicators. Go deeper on proof, provenance, and replay authority in Assurance."
      secondaryHref="/assurance"
      secondaryLabel="View Assurance"
    >
      <section className="grid gap-4 md:grid-cols-4">
        <article className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">System</div>
          <div className="mt-3 text-4xl font-black tracking-[-0.05em] text-white">
            {snapshot.latency.available
              ? snapshot.latency.withinBudget.total
                ? 'Healthy'
                : 'Watch'
              : 'Pending'}
          </div>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            Fast operational read across engine latency and current control-plane posture.
          </p>
        </article>
        <article className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Recent Frames</div>
          <div className="mt-3 text-4xl font-black tracking-[-0.05em] text-white">
            {snapshot.recentDecisions.items.length}
          </div>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            Latest decision frames visible from the live decision endpoint.
          </p>
        </article>
        <article className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Trace</div>
          <div className="mt-3 text-4xl font-black tracking-[-0.05em] text-white">
            {snapshot.traceLedger.traceAvailable ? 'Live' : 'Unavailable'}
          </div>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            Trace-backed proof posture for the latest decision frame.
          </p>
        </article>
        <article className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Latency</div>
          <div className="mt-3 text-4xl font-black tracking-[-0.05em] text-white">
            {snapshot.latency.p95TotalMs == null ? 'n/a' : `${snapshot.latency.p95TotalMs} ms`}
          </div>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            Current p95 total latency from the live SLO window.
          </p>
        </article>
        <article className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Trust Indicators</div>
          <div className="mt-3 text-4xl font-black tracking-[-0.05em] text-white">
            {verifiedDatasets}/{snapshot.providers.datasets.length}
          </div>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            Verified water datasets plus live trace/replay posture in one operational scan.
          </p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <RecentDecisionsList decisions={snapshot.recentDecisions} />
        <div className="grid gap-4 sm:grid-cols-2">
          <GovernancePanel governance={snapshot.governance} />
          <LatencyPanel latency={snapshot.latency} />
          <article className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
            <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-300">Operational Trust</div>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <div className="flex items-center justify-between gap-3">
                <span>trace posture</span>
                <span className="font-semibold text-white">
                  {snapshot.traceLedger.traceAvailable ? 'live' : 'unavailable'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>replay posture</span>
                <span className="font-semibold text-white">
                  {snapshot.traceLedger.replayConsistent == null
                    ? 'on inspect'
                    : snapshot.traceLedger.replayConsistent
                      ? 'consistent'
                      : 'mismatch'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>proof attached</span>
                <span className="font-semibold text-white">
                  {!snapshot.traceLedger.available
                    ? 'unavailable'
                    : snapshot.traceLedger.proofAvailable
                      ? 'yes'
                      : 'no'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>verified datasets</span>
                <span className="font-semibold text-white">
                  {verifiedDatasets}/{snapshot.providers.datasets.length}
                </span>
              </div>
            </div>
          </article>
          <article className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
            <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-300">Recency</div>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <div className="flex items-center justify-between gap-3">
                <span>snapshot generated</span>
                <span className="font-semibold text-white">{snapshot.generatedAt}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>latest frame</span>
                <span className="font-semibold text-white">
                  {latestDecision?.decisionFrameId.slice(0, 8) ?? 'none'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>latest action</span>
                <span className="font-semibold text-white">
                  {latestDecision?.action ?? 'unavailable'}
                </span>
              </div>
              <div className="text-xs leading-6 text-slate-500">
                Status stays concise by design. Use Assurance for proof depth, trace hashes, and
                provenance verification detail.
              </div>
            </div>
          </article>
        </div>
      </section>
    </InformationPageShell>
  )
}
