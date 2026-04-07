import type { Metadata } from 'next'
import Link from 'next/link'

import { createPageMetadata } from '@/lib/seo'

export const metadata: Metadata = createPageMetadata({
  title: 'HallOGrid Pro',
  description:
    'Compare the public HallOGrid live mirror with HallOGrid Pro, the gated operator surface for workload authority, proof, replay, doctrine, and governed execution.',
  path: '/purchase',
  keywords: [
    'HallOGrid Pro',
    'live mirror',
    'operator console',
    'governed execution',
    'trace replay proof',
  ],
})

const previewPoints = [
  'Public, read-only live mirror',
  'Delayed timestamps and redacted frame detail',
  'Live Grid Theater, world state, and governed decision feed',
  'Category education on decision frames, replay, and proof',
  'Upgrade paths for pilots, doctrine, and workload connection',
]

const proPoints = [
  'Advisory, supervised automatic, and full authority modes',
  'Full decision frame detail with trace, replay, proof, and counterfactuals',
  'Doctrine manager, override queue, safety envelope, and hazard registry',
  'Business impact analytics: avoided cost, avoided SLO breaches, operator relief',
  'Tenant-aware integrations across CI/CD, queues, Kubernetes, and cloud runners',
]

const lockedSurfaces = [
  'Counterfactual analysis',
  'Replay workspace',
  'Doctrine manager',
  'Override queue',
  'Safety envelope',
  'Hazard and near-miss registry',
  'Compliance cockpit',
  'Drill simulator',
]

export default function PurchasePage() {
  return (
    <div className="space-y-8 pb-10">
      <section className="surface-card-strong p-8">
        <div className="eyebrow">HallOGrid packaging</div>
        <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">
          Public live mirror outside. Operator authority inside Pro.
        </h1>
        <p className="mt-4 max-w-4xl text-base leading-7 text-slate-300">
          HallOGrid is packaged so the public console proves the category without giving away
          the operational advantage. The live mirror builds trust. HallOGrid Pro is the
          tenant-aware control surface where Platform and SRE teams actually govern compute.
        </p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="surface-card p-6">
          <div className="eyebrow">Free Preview</div>
          <div className="mt-4 text-3xl font-semibold text-white">Live Mirror</div>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            Public, no-risk, and read-only. Shows enough live credibility to prove HallOGrid is
            real while keeping frame detail, workload control, and tenant-specific routing gated.
          </p>
          <div className="mt-5 space-y-3">
            {previewPoints.map((point) => (
              <div key={point} className="flex items-start gap-3 text-sm leading-7 text-slate-300">
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-amber-300/90" />
                <span>{point}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-3xl border border-white/10 bg-black/20 p-4 text-sm leading-7 text-slate-300">
            Best for inbound credibility, category education, and proving that HallOGrid is a live
            execution authority system rather than a concept deck.
          </div>
        </div>

        <div className="surface-card flex h-full flex-col p-6">
          <div className="eyebrow">HallOGrid Pro</div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="text-3xl font-semibold text-white">Operator Surface</div>
            <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">
              Hybrid GTM
            </span>
          </div>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            Starts with guided evaluation and converts to a sales-led production rollout. Pro is
            where governed compute becomes operationally necessary instead of visually impressive.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {proPoints.map((point) => (
              <div key={point} className="rounded-3xl border border-white/10 bg-black/20 p-4 text-sm leading-7 text-slate-300">
                {point}
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/access"
              className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-200 transition hover:border-cyan-300/30 hover:bg-cyan-300/15 hover:text-white"
            >
              Run a pilot
            </Link>
            <Link
              href="/pricing"
              className="inline-flex rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
            >
              View packaging
            </Link>
          </div>
        </div>
      </section>

      <section className="surface-card p-8">
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <div className="eyebrow">Pro-only surfaces</div>
            <h2 className="mt-3 text-3xl font-semibold text-white">
              Gate the operating advantage, not the credibility.
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-300">
              The public preview should never imply direct control over workloads. These surfaces
              stay behind entitlement, role, and onboarding gates because they are the pieces that
              reduce operator burden and make HallOGrid difficult to replace.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {lockedSurfaces.map((surface) => (
              <div key={surface} className="rounded-3xl border border-white/10 bg-black/20 p-4 text-sm font-medium text-slate-200">
                {surface}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
