'use client'

import { HeroMotionSurface } from '@/components/landing/HeroMotionSurface'
import { ActionStrip } from '@/components/landing/ActionStrip'
import { DecisionExampleCard } from '@/components/landing/DecisionExampleCard'
import { CategoryDifferenceSection } from '@/components/landing/CategoryDifferenceSection'
import { DecisionFlowDiagram } from '@/components/DecisionFlowDiagram'
import { ProofMoatSection } from '@/components/landing/ProofMoatSection'
import { SignalDoctrineSection } from '@/components/landing/SignalDoctrineSection'
import { PricingOrControlSection } from '@/components/landing/PricingOrControlSection'
import { FinalCTASection } from '@/components/landing/FinalCTASection'
import { LiveSystemSection } from '@/components/landing/LiveSystemSection'
import { FALLBACK_LANDING_SNAPSHOT } from '@/lib/control-surface/fallbacks'
import { useLandingSnapshot } from '@/lib/hooks/control-surface'

export default function LandingPage() {
  const landingQuery = useLandingSnapshot()
  const landing = landingQuery.data ?? FALLBACK_LANDING_SNAPSHOT
  const overview = landing.overview
  const liveStatus = landing.liveStatus

  return (
    <div className="space-y-8 pb-8">
      {landingQuery.error ? (
        <section className="rounded-[24px] border border-amber-300/20 bg-amber-300/10 px-5 py-4 text-sm text-amber-100">
          Live control data is temporarily unavailable. The public surface stays resolved while the
          live decision and proof chain reconnect.
        </section>
      ) : null}

      <HeroMotionSurface liveDecision={overview.featuredDecision} />

      <section className="grid gap-3 lg:grid-cols-3">
        {overview.liveStrip.length > 0
          ? overview.liveStrip.map((decision) => (
              <div
                key={decision.decisionFrameId}
                className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    live decision
                  </div>
                  <div className="rounded-full border border-emerald-400/20 bg-emerald-400/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                    live {liveStatus.lastUpdatedLabel}
                  </div>
                </div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {decision.workloadLabel ?? 'Current execution frame'}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                  <span className="rounded-full bg-white/[0.04] px-2 py-1">{decision.action}</span>
                  <span className="rounded-full bg-white/[0.04] px-2 py-1">
                    {decision.selectedRegion ?? 'routing region on frame'}
                  </span>
                  <span className="rounded-full bg-white/[0.04] px-2 py-1">
                    {decision.carbonReductionPct != null
                      ? `${decision.carbonReductionPct.toFixed(1)}% carbon delta`
                      : 'carbon delta on frame'}
                  </span>
                </div>
              </div>
            ))
          : [
              {
                title: 'Execution authority',
                detail: 'The shell resolves immediately so visitors understand the control plane before live data attaches.',
              },
              {
                title: 'Proof chain',
                detail: 'Trace, replay, and provenance attach to the same decision frame instead of replacing the page with a loading state.',
              },
              {
                title: 'Governance',
                detail: 'SAIQ and policy state remain visible as product structure while the current live frame attaches.',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4"
              >
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  stable shell
                </div>
                <div className="mt-2 text-lg font-semibold text-white">{item.title}</div>
                <div className="mt-3 text-sm leading-7 text-slate-300">{item.detail}</div>
              </div>
            ))}
      </section>

      <section className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
        <div className="max-w-3xl">
          <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-300">What it does</div>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl">
            You do not optimize infrastructure anymore.
            <span className="block bg-gradient-to-r from-emerald-300 via-cyan-300 to-sky-400 bg-clip-text text-transparent">
              You control it.
            </span>
          </h2>
          <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-base">
            A workload asks to run. CO2 Router co-evaluates carbon, water, latency, and cost.
            SAIQ governance and policy constraints return one of five binding actions before
            execution. The executor follows the decision. Proof, trace, replay, and provenance stay
            attached to the same frame.
          </p>
        </div>
        <div className="mt-8">
          <ActionStrip distribution={overview.actionDistribution} />
        </div>
      </section>

      <section className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
        <DecisionFlowDiagram />
      </section>

      <DecisionExampleCard decision={overview.featuredDecision} proofContext={overview.proofContext} />

      <CategoryDifferenceSection />

      <ProofMoatSection proofContext={overview.proofContext} />
      <SignalDoctrineSection providers={overview.providers} />
      <PricingOrControlSection />
      <FinalCTASection />
      <LiveSystemSection snapshot={landing.liveSystem} liveStatus={liveStatus} />
    </div>
  )
}
