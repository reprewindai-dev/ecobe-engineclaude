import type { Metadata } from 'next'
import Link from 'next/link'

import { InformationPageShell } from '@/components/site/InformationPageShell'
import { createPageMetadata } from '@/lib/seo'
import { legalResourceLinks } from '@/lib/site-navigation'

export const metadata: Metadata = createPageMetadata({
  title: 'Security',
  description:
    'Public security posture for CO2 Router: protected internal routes, controlled proof surfaces, and clear disclosure paths for a system that sits before execution.',
  path: '/company/security',
  keywords: ['security posture', 'protected trace routes', 'security disclosure'],
})

export default function CompanySecurityPage() {
  return (
    <InformationPageShell
      eyebrow="Company / Security"
      title="Security posture for a control plane that sits before execution."
      summary="CO2 Router treats security as operating discipline around execution authority: protected internal routes, controlled proof surfaces, separated contact paths, and truthful public posture without invented certifications."
      secondaryHref="/contact"
      secondaryLabel="Contact Security"
    >
      <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <article className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Operational posture</div>
          <div className="mt-4 space-y-4 text-sm leading-7 text-slate-300">
            <p>Internal trace and replay routes are protected behind service authentication rather than exposed as anonymous public endpoints.</p>
            <p>Proof, provenance, and live latency views shown on the site are composed from the engine without loosening backend contracts.</p>
            <p>Security issues, support issues, and legal obligations each have separate public contact paths.</p>
          </div>
        </article>
        <article className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Legal resources</div>
          <div className="mt-4 space-y-2">
            {legalResourceLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block rounded-2xl border border-white/8 bg-slate-950/60 px-4 py-3 text-sm text-slate-200 transition hover:border-cyan-300/30 hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </article>
      </section>
    </InformationPageShell>
  )
}
