import type { Metadata } from 'next'
import Link from 'next/link'

import {
  designPartnerBenefits,
  designPartnerCommitments,
  designPartnerContactEmail,
  designPartnerIdealProfiles,
  designPartnerPageCopy,
  designPartnerSuccessMetrics,
  designPartnerTimeline,
  designPartnerUseCases,
} from '@/lib/design-partner-program'
import { createPageMetadata } from '@/lib/seo'

export const metadata: Metadata = createPageMetadata({
  title: 'Design Partner Program One-Pager',
  description:
    'A one-page briefing for the CO2 Router Design Partner Program: fit, scope, term, success criteria, and the direct application path.',
  path: '/design-partners/one-pager',
  keywords: ['CO2 Router one-pager', 'design partner brief', 'compute control pilot'],
})

export default function DesignPartnerOnePagerPage() {
  return (
    <div className="space-y-6 pb-8">
      <section className="rounded-[36px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.14),transparent_34%),linear-gradient(180deg,rgba(5,10,20,0.96),rgba(2,8,18,0.98))] p-6 sm:p-8 lg:p-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-4xl">
            <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-300">
              CO2 Router Design Partner Program
            </div>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.05em] text-white sm:text-5xl">
              {designPartnerPageCopy.title}
            </h1>
            <p className="mt-5 max-w-3xl text-sm leading-8 text-slate-300 sm:text-base">
              {designPartnerPageCopy.summary}
            </p>
          </div>
          <Link
            href="/design-partners"
            className="rounded-2xl border border-white/12 bg-white/[0.04] px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white"
          >
            Open Application Page
          </Link>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-300">Who This Is For</div>
          <div className="mt-5 space-y-4 text-sm leading-7 text-slate-300">
            {designPartnerIdealProfiles.map((item) => (
              <div key={item} className="border-t border-white/10 pt-4">
                {item}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-300">Best Early Lanes</div>
          <div className="mt-5 space-y-4 text-sm leading-7 text-slate-300">
            {designPartnerUseCases.map((item) => (
              <div key={item.title} className="border-t border-white/10 pt-4">
                <div className="font-semibold text-white">{item.title}</div>
                <div className="mt-2">{item.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-300">What Partners Get</div>
          <div className="mt-5 space-y-4 text-sm leading-7 text-slate-300">
            {designPartnerBenefits.map((item) => (
              <div key={item} className="border-t border-white/10 pt-4">
                {item}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-300">What We Ask</div>
          <div className="mt-5 space-y-4 text-sm leading-7 text-slate-300">
            {designPartnerCommitments.map((item) => (
              <div key={item} className="border-t border-white/10 pt-4">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
        <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-300">Pilot Structure</div>
        <div className="mt-6 grid gap-4 lg:grid-cols-4">
          {designPartnerTimeline.map((item) => (
            <div key={item.phase} className="border-t border-white/10 pt-4">
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{item.phase}</div>
              <div className="mt-2 text-lg font-semibold text-white">{item.title}</div>
              <div className="mt-2 text-sm leading-7 text-slate-300">{item.detail}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-300">How Success Is Measured</div>
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

        <div className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(6,17,30,0.98),rgba(2,8,18,0.98))] p-6 sm:p-8">
          <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-300">Apply</div>
          <div className="mt-4 text-2xl font-black tracking-[-0.04em] text-white">
            Send a short note with your role, workloads, and policy goals.
          </div>
          <div className="mt-4 text-sm leading-7 text-slate-300">
            Contact: {designPartnerContactEmail}
          </div>
          <div className="mt-6 border-t border-white/10 pt-4 text-sm leading-7 text-slate-300">
            Phase-one win condition stays locked: three accepted partners, first value fast, one
            paid conversion, and one usable proof asset.
          </div>
        </div>
      </section>
    </div>
  )
}
