import type { Metadata } from 'next'

import { InformationPageShell } from '@/components/site/InformationPageShell'
import { createPageMetadata } from '@/lib/seo'

const curlExample = `curl -X POST https://co2router.com/api/ecobe/ci/authorize \\
  -H "content-type: application/json" \\
  -d '{
    "preferredRegions": ["us-east-1", "us-west-2"],
    "decisionMode": "runtime_authorization",
    "jobType": "standard",
    "criticality": "standard",
    "waterPolicyProfile": "default",
    "allowDelay": true,
    "estimatedEnergyKwh": 2.5
  }'`

export const metadata: Metadata = createPageMetadata({
  title: 'Developers Quickstart',
  description:
    'Authorize a workload before execution, use the returned decision as authority, then inspect proof, trace, replay, and provenance.',
  path: '/developers/quickstart',
  keywords: ['quickstart', 'authorize workload', 'binding action', 'trace replay'],
})

export default function DevelopersQuickstartPage() {
  return (
    <InformationPageShell
      eyebrow="Developers / Quickstart"
      title="Authorize a workload before it runs."
      summary="The quickstart is the real control-plane loop: send a decision request, treat the returned action as execution authority, then inspect proof, trace, replay, and provenance against the same frame."
      secondaryHref="/developers/api"
      secondaryLabel="View API"
    >
      <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
        <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Step 1</div>
        <h2 className="mt-3 text-2xl font-bold text-white">Send a decision request</h2>
        <div className="mt-4 rounded-2xl border border-white/8 bg-slate-950/60 p-4">
          <pre className="overflow-x-auto text-xs leading-6 text-slate-200">
            <code>{curlExample}</code>
          </pre>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          {
            title: 'Step 2',
            body: 'Use the returned decision action, selected region, reason code, and proof hash as the execution authority. The workload does not run until that result is accepted.',
          },
          {
            title: 'Step 3',
            body: 'Inspect the same decision frame through trace and replay endpoints when you need verification, debugging, or customer-facing proof.',
          },
          {
            title: 'Step 4',
            body: 'Use water provenance and SLO endpoints to confirm that the authority layer and real-time decision path remain in a defensible state.',
          },
        ].map((card) => (
          <article key={card.title} className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
            <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">{card.title}</div>
            <p className="mt-4 text-sm leading-7 text-slate-300">{card.body}</p>
          </article>
        ))}
      </section>
    </InformationPageShell>
  )
}
