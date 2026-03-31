'use client'

import { formatFreshness } from '@/lib/control-surface/labels'
import type { CiHealthSnapshot, ControlSurfaceProviderNode, OutboxMetrics } from '@/types/control-surface'

export function MSSStatusPanel({
  providers,
  health,
  outbox,
}: {
  providers: ControlSurfaceProviderNode[]
  health: CiHealthSnapshot
  outbox: OutboxMetrics | null
}) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
      <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">Signal fabric / MSS</div>
      <h3 className="mt-2 text-xl font-bold text-white">Marginal and fallback provenance</h3>
      <div className="mt-5 grid gap-3">
        {providers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/8 bg-white/[0.03] px-4 py-6 text-sm text-slate-400">
            Provider trust details are temporarily degraded. The live surface stayed available, but mirrored freshness data could not be loaded.
          </div>
        ) : (
          providers.map((provider) => (
            <div
              key={provider.id}
              className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-white">{provider.label}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {(provider.providerType ?? 'carbon')} plane | {provider.mode ?? 'mirrored'} mode | {provider.signalAuthority ?? 'average'} signal | {provider.authorityRole ?? 'advisory'} authority
                  </div>
                  {provider.authorityMode ? (
                    <div className="mt-1 text-xs text-slate-500">
                      {provider.authorityMode} / {provider.scenario ?? 'current'}
                    </div>
                  ) : null}
                  {provider.degradedReason ? (
                    <div className="mt-1 text-xs text-amber-300">{provider.degradedReason}</div>
                  ) : null}
                </div>
                <div className="text-right">
                  <div className={`text-sm font-semibold ${provider.status === 'healthy' ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {provider.status}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{formatFreshness(provider.freshnessSec)}</div>
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-3">
                <div>Confidence impact: {provider.confidence != null ? `${(provider.confidence * 100).toFixed(0)}%` : 'n/a'}</div>
                <div>Mirror version: {provider.mirrorVersion ?? 'current mirror'}</div>
                <div>Mirror state: {provider.mirrored ? 'replicated' : 'direct only'}</div>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Water bundle</div>
          <div className="mt-2 text-sm font-semibold text-white">
            {health.checks.waterArtifacts.schemaCompatible ? 'Schema compatible' : 'Degraded'}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            {health.checks.waterArtifacts.regionCount} regions | {health.checks.waterArtifacts.sourceCount} sources
          </div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Signed delivery</div>
          <div className="mt-2 text-sm font-semibold text-white">
            {outbox ? `${outbox.counts.sent} sent / ${outbox.counts.pending} pending` : 'Internal metrics unavailable'}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            {outbox ? `lag ${outbox.lagMinutes.toFixed(1)}m | failure ${outbox.failureRatePct.toFixed(1)}%` : 'Set the internal API key to surface outbox posture.'}
          </div>
        </div>
      </div>
    </section>
  )
}
