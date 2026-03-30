'use client'

import type { LucideIcon } from 'lucide-react'
import { Boxes, Cloud, Database, GitBranch, Globe, Package2, Server, Webhook, Workflow, Clock3 } from 'lucide-react'

type RuntimeTile = {
  label: string
  Icon: LucideIcon
}

const runtimeTiles: RuntimeTile[] = [
  { label: 'AWS / Lambda', Icon: Cloud },
  { label: 'Kubernetes', Icon: Boxes },
  { label: 'Docker', Icon: Package2 },
  { label: 'GitHub Actions', Icon: GitBranch },
  { label: 'Postgres', Icon: Database },
  { label: 'Redis', Icon: Server },
  { label: 'HTTP API', Icon: Globe },
  { label: 'Webhooks', Icon: Webhook },
  { label: 'Queues / Jobs', Icon: Clock3 },
  { label: 'CI / CD', Icon: Workflow },
]

export function IntegrationMarquee() {
  const items = [...runtimeTiles, ...runtimeTiles]

  return (
    <section className="surface-card overflow-hidden p-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="eyebrow">Infrastructure footprint</div>
          <h2 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">Runs across your existing infrastructure.</h2>
        </div>
        <p className="max-w-2xl text-sm leading-7 text-slate-300">
          One decision core, multiple control points. The runtime surface should feel connected to the systems buyers already trust.
        </p>
      </div>

      <div className="marquee-mask mt-6">
        <div className="marquee-track">
          {items.map((tile, index) => (
            <div
              key={`${tile.label}-${index}`}
              className="integration-tile group inline-flex min-w-[178px] flex-col items-center justify-center gap-3 rounded-[1.6rem] border border-white/10 bg-slate-950/65 px-5 py-4 text-center shadow-[0_16px_40px_rgba(2,6,23,0.28)]"
            >
              <span className="integration-tile-icon inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-slate-100 transition duration-300 group-hover:border-cyan-300/25 group-hover:text-white">
                <tile.Icon className="h-5 w-5" />
              </span>
              <span className="text-sm font-medium text-slate-100">{tile.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
