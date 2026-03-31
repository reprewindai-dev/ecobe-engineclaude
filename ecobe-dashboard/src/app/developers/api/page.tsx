import type { Metadata } from 'next'

import { InformationPageShell } from '@/components/site/InformationPageShell'
import { createPageMetadata } from '@/lib/seo'

export const metadata: Metadata = createPageMetadata({
  title: 'Developers API',
  description:
    'The canonical HTTP contract for binding pre-execution decisions, proof references, trace inspection, replay, and provenance lookups.',
  path: '/developers/api',
  keywords: ['decision API', 'pre-execution authorization API', 'trace replay API'],
})

const requestExample = `POST /api/v1/ci/authorize
{
  "requestId": "frame-001",
  "preferredRegions": ["us-east-1", "us-west-2"],
  "carbonWeight": 0.55,
  "waterWeight": 0.35,
  "latencyWeight": 0.05,
  "costWeight": 0.05,
  "decisionMode": "runtime_authorization",
  "jobType": "standard",
  "criticality": "standard",
  "waterPolicyProfile": "default",
  "allowDelay": true,
  "estimatedEnergyKwh": 2.5
}`

const responseExample = `{
  "decision": "delay",
  "decisionFrameId": "fb6014d7-b190-430b-9bf9-0a48bc6e31f1",
  "selectedRegion": "us-east-1",
  "reasonCode": "DELAY_HIGH_WATER",
  "proofHash": "efd5d83e754208afbca395e7cf0e6e07b905be43293e4b161adafda5b5a72b63",
  "waterAuthority": {
    "authorityMode": "basin",
    "scenario": "current"
  },
  "policyTrace": {
    "policyVersion": "co2_router_doctrine_v1"
  }
}`

export default function DevelopersApiPage() {
  return (
    <InformationPageShell
      eyebrow="Developers / API"
      title="The canonical HTTP contract for pre-execution decisions."
      summary="The API is the execution contract: request authorization before a workload runs, receive one binding action, then inspect proof, trace, replay, and provenance against the same decision frame."
      secondaryHref="/developers/quickstart"
      secondaryLabel="Open Quickstart"
    >
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Authorization</div>
          <div className="mt-4 rounded-2xl border border-white/8 bg-slate-950/60 p-4">
            <pre className="overflow-x-auto text-xs leading-6 text-slate-200">
              <code>{requestExample}</code>
            </pre>
          </div>
        </article>
        <article className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Response</div>
          <div className="mt-4 rounded-2xl border border-white/8 bg-slate-950/60 p-4">
            <pre className="overflow-x-auto text-xs leading-6 text-slate-200">
              <code>{responseExample}</code>
            </pre>
          </div>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          {
            title: 'Decision routes',
            lines: ['/api/v1/ci/authorize', '/api/v1/ci/decisions', '/api/v1/ci/slo'],
          },
          {
            title: 'Trace + replay',
            lines: [
              '/api/v1/ci/decisions/:decisionFrameId/trace',
              '/api/v1/ci/decisions/:decisionFrameId/trace/raw',
              '/api/v1/ci/decisions/:decisionFrameId/replay',
            ],
          },
          {
            title: 'Authority + provenance',
            lines: [
              '/api/v1/water/provenance',
              '/api/v1/water/providers',
              '/api/v1/water/evidence/:decisionFrameId',
            ],
          },
        ].map((group) => (
          <article key={group.title} className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
            <h2 className="text-xl font-bold text-white">{group.title}</h2>
            <div className="mt-4 space-y-2 text-sm text-slate-300">
              {group.lines.map((line) => (
                <div
                  key={line}
                  className="rounded-xl border border-white/8 bg-slate-950/60 px-3 py-2 font-mono text-xs text-slate-200"
                >
                  {line}
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>
    </InformationPageShell>
  )
}
