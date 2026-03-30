import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Check, Dot, Orbit, Sparkles } from 'lucide-react'

import { DesignPartnerApplicationForm } from '@/components/design-partners/DesignPartnerApplicationForm'
import {
  designPartnerBenefits,
  designPartnerCommercialRules,
  designPartnerCommitments,
  designPartnerDisqualifiers,
  designPartnerHeroStats,
  designPartnerIdealProfiles,
  designPartnerPageCopy,
  designPartnerSuccessMetrics,
  designPartnerTimeline,
  designPartnerUseCases,
} from '@/lib/design-partner-program'
import { createPageMetadata } from '@/lib/seo'

export const metadata: Metadata = createPageMetadata({
  title: 'Design Partner Program',
  description:
    'Join the CO2 Router Design Partner Program: a structured 3-month pilot for infra, platform, SRE, and data teams piloting one governed compute workflow with a clear paid path.',
  path: '/design-partners',
  keywords: [
    'CO2 Router design partner program',
    'pre-execution compute control',
    'carbon aware CI pilot',
    'environmental workload authorization',
  ],
})

export default function DesignPartnersPage() {
  return (
    <div className="space-y-8 pb-8">
      <section className="relative overflow-hidden rounded-[40px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.16),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.14),transparent_30%),linear-gradient(145deg,rgba(3,7,18,0.98),rgba(8,15,30,0.98))] px-6 py-8 sm:px-8 lg:px-10 lg:py-10">
        <div className="absolute right-[-8%] top-[-18%] h-56 w-56 rounded-full border border-cyan-300/10 bg-cyan-300/10 blur-3xl" />
        <div className="absolute bottom-[-20%] right-[12%] h-64 w-64 rounded-full border border-emerald-300/10 bg-emerald-300/10 blur-3xl" />

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_420px] lg:items-end">
          <div className="relative z-10 max-w-4xl space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-[11px] uppercase tracking-[0.26em] text-cyan-200 animate-fade-in">
              <Sparkles className="h-3.5 w-3.5" />
              {designPartnerPageCopy.eyebrow}
            </div>
            <div className="space-y-4 animate-slide-up">
              <h1 className="max-w-4xl text-balance text-4xl font-black tracking-[-0.055em] text-white sm:text-5xl lg:text-6xl">
                {designPartnerPageCopy.title}
              </h1>
              <p className="max-w-3xl text-base leading-8 text-slate-300">
                {designPartnerPageCopy.summary}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 animate-slide-up">
              <a
                href="#apply"
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-300 via-cyan-300 to-sky-400 px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-slate-950"
              >
                Apply For The Pilot
                <ArrowRight className="h-4 w-4" />
              </a>
              <Link
                href="/design-partners/one-pager"
                className="rounded-2xl border border-white/12 bg-white/[0.04] px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white"
              >
                Open One-Pager
              </Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {designPartnerHeroStats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-[24px] border border-white/8 bg-white/[0.035] px-4 py-4"
                >
                  <div className="text-2xl font-black tracking-[-0.04em] text-white">
                    {stat.value}
                  </div>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 overflow-hidden rounded-[32px] border border-white/10 bg-slate-950/65 p-6">
            <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-cyan-300/40 to-transparent" />
            <div className="absolute right-5 top-5 hidden rounded-full border border-cyan-300/20 bg-cyan-300/10 p-3 text-cyan-200 lg:block">
              <Orbit className="h-4 w-4" />
            </div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-300">Pilot rail</div>
            <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-white">
              {designPartnerPageCopy.posterTitle}
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-300">
              {designPartnerPageCopy.posterDetail}
            </p>

            <div className="mt-6 space-y-4 border-t border-white/10 pt-5">
              {designPartnerTimeline.map((item) => (
                <div key={item.phase} className="grid grid-cols-[72px_1fr] gap-4">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    {item.phase}
                  </div>
                  <div className="border-l border-white/10 pl-4">
                    <div className="text-sm font-semibold text-white">{item.title}</div>
                    <div className="mt-1 text-sm leading-7 text-slate-300">{item.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-300">
            Best-Fit ICP
          </div>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white">
            Narrow fit wins this phase.
          </h2>
          <div className="mt-6 space-y-4">
            {designPartnerIdealProfiles.map((line) => (
              <div key={line} className="flex gap-3 text-sm leading-7 text-slate-300">
                <Check className="mt-1 h-4 w-4 flex-none text-emerald-300" />
                <span>{line}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,7,13,0.9),rgba(12,7,14,0.96))] p-6 sm:p-8">
          <div className="text-[11px] uppercase tracking-[0.24em] text-rose-200">Disqualifiers</div>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white">
            Anything vague gets declined.
          </h2>
          <div className="mt-6 space-y-4">
            {designPartnerDisqualifiers.map((line) => (
              <div key={line} className="flex gap-3 text-sm leading-7 text-rose-50/85">
                <Dot className="mt-1 h-5 w-5 flex-none text-rose-300" />
                <span>{line}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[36px] border border-white/10 bg-white/[0.03] p-6 sm:p-8 lg:p-10">
        <div className="max-w-3xl">
          <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-300">Entry wedge</div>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl">
            Start with one workflow lane and make it operational fast.
          </h2>
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {designPartnerUseCases.map((item) => (
            <article
              key={item.title}
              className="border-t border-white/10 pt-4 text-sm leading-7 text-slate-300"
            >
              <div className="text-lg font-semibold text-white">{item.title}</div>
              <p className="mt-3">{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
        <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-300">What partners get</div>
          <div className="mt-5 space-y-4">
            {designPartnerBenefits.map((item) => (
              <div key={item} className="border-t border-white/10 pt-4 text-sm leading-7 text-slate-300">
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-300">What we ask</div>
          <div className="mt-5 space-y-4">
            {designPartnerCommitments.map((item) => (
              <div key={item} className="border-t border-white/10 pt-4 text-sm leading-7 text-slate-300">
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(4,15,18,0.96),rgba(2,8,18,0.98))] p-6 sm:p-8">
          <div className="text-[11px] uppercase tracking-[0.24em] text-emerald-300">Commercial rule</div>
          <div className="mt-5 space-y-4">
            {designPartnerCommercialRules.map((item) => (
              <div key={item} className="border-t border-white/10 pt-4 text-sm leading-7 text-slate-300">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_360px]">
        <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-300">
            Success Measures
          </div>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white">
            The program only counts if it converts into evidence and revenue.
          </h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {designPartnerSuccessMetrics.map((metric) => (
              <div
                key={metric}
                className="rounded-[22px] border border-white/8 bg-slate-950/40 px-4 py-4 text-sm leading-7 text-slate-300"
              >
                {metric}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(4,10,18,0.98),rgba(2,8,18,0.98))] p-6 sm:p-8">
          <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-300">
            Phase-One Lock
          </div>
          <div className="mt-4 text-2xl font-black tracking-[-0.04em] text-white">
            Three accepted partners. First value fast. One paid conversion. One proof asset.
          </div>
          <p className="mt-4 text-sm leading-7 text-slate-300">
            This is not a broad beta and not a generalized sustainability waitlist. The category
            wedge stays narrow until the operator motion is repeatable.
          </p>
          <div className="mt-6 border-t border-white/10 pt-4 text-sm leading-7 text-slate-300">
            The graduation call happens before pilot end and leads to one of three outcomes:
            converted, strict extension with reason, or a clean close with feedback captured.
          </div>
        </div>
      </section>

      <section id="apply" className="scroll-mt-24">
        <DesignPartnerApplicationForm />
      </section>
    </div>
  )
}
