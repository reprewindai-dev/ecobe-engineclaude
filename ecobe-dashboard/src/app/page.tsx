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
import { FALLBACK_OVERVIEW } from '@/lib/control-surface/fallbacks'
import { useControlSurfaceOverview } from '@/lib/hooks/control-surface'

export default function LandingPage() {
  const overviewQuery = useControlSurfaceOverview()
  const overview = overviewQuery.data

  const decisions = overview?.decisions ?? []
  const providers = overview?.providers ?? FALLBACK_OVERVIEW.providers
  const replay = overview?.replay ?? FALLBACK_OVERVIEW.replay
  const actionDistribution = overview?.actionDistribution ?? FALLBACK_OVERVIEW.actionDistribution
  const liveStrip = [...decisions]
    .sort(
      (a, b) =>
        b.carbonReductionPct + b.waterImpactDeltaLiters - (a.carbonReductionPct + a.waterImpactDeltaLiters)
    )
    .slice(0, 3)
  const heroDecision =
    overview?.featuredDecision &&
    'decisionFrameId' in overview.featuredDecision &&
    !('decision' in overview.featuredDecision)
      ? overview.featuredDecision
      : decisions[0] ?? null
  const featuredDecision =
    overview?.featuredDecision && 'decision' in overview.featuredDecision
      ? overview.featuredDecision
      : overview?.liveDecision ?? null
  const waterProviders = providers.filter((provider) => provider.providerType === 'water')
  const verifiedWaterDatasets = waterProviders.filter(
    (provider) => provider.provenanceStatus === 'verified'
  ).length
  const proofContext = {
    proofRef: featuredDecision?.proofHash ?? null,
    governance:
      featuredDecision && 'policyTrace' in featuredDecision
        ? featuredDecision.policyTrace.profile ??
          featuredDecision.policyTrace.policyVersion ??
          'SAIQ policy trace attached'
        : 'SAIQ policy trace attaches with the live decision frame.',
    traceRef: replay?.decisionFrameId ?? featuredDecision?.decisionFrameId ?? null,
    replay:
      replay == null
        ? 'live proof sample'
        : replay.deterministicMatch
          ? 'deterministic match'
          : 'replay available',
    provenance:
      waterProviders.length > 0
        ? `${verifiedWaterDatasets}/${waterProviders.length} datasets verified`
        : 'verified datasets will attach with live provenance',
  }

  return (
    <div className="space-y-8 pb-8">
      {overviewQuery.error ? (
        <section className="rounded-[24px] border border-amber-300/20 bg-amber-300/10 px-5 py-4 text-sm text-amber-100">
          Live control data is temporarily unavailable. The public surface stays resolved while the
          live decision and proof chain reconnect.
        </section>
      ) : null}

      <HeroMotionSurface liveDecision={heroDecision} />

      <section className="grid gap-3 lg:grid-cols-3">
        {liveStrip.length > 0
          ? liveStrip.map((decision) => (
              <div
                key={decision.decisionFrameId}
                className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4"
              >
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  live decision
                </div>
                <div className="mt-2 text-lg font-semibold text-white">{decision.workloadLabel}</div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                  <span className="rounded-full bg-white/[0.04] px-2 py-1">{decision.action}</span>
                  <span className="rounded-full bg-white/[0.04] px-2 py-1">{decision.selectedRegion}</span>
                  <span className="rounded-full bg-white/[0.04] px-2 py-1">
                    {decision.carbonReductionPct.toFixed(1)}% carbon delta
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
                detail: 'SAIQ and policy state remain visible as product structure, even when the current live frame is still hydrating.',
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
          <ActionStrip distribution={actionDistribution} />
        </div>
      </section>

      <section className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
        <DecisionFlowDiagram />
      </section>

      <DecisionExampleCard decision={featuredDecision} proofContext={proofContext} />

      <CategoryDifferenceSection />

      <ProofMoatSection replay={replay} />
      <SignalDoctrineSection providers={providers} />
      <PricingOrControlSection />
      <FinalCTASection />
      <LiveSystemSection />
    </div>
  )
}
