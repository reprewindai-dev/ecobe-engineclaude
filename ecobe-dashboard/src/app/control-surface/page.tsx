import {
  classifySourceMode,
  formatMs,
  formatPct,
  getControlPlaneSnapshot,
} from '@/lib/ecobe'
import { resolveHallOGridAccessFromServer } from '@/lib/control-surface/access'

const actionTone: Record<string, string> = {
  run_now: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100',
  reroute: 'border-cyan-300/25 bg-cyan-400/10 text-cyan-100',
  delay: 'border-amber-300/25 bg-amber-400/10 text-amber-100',
  throttle: 'border-orange-300/25 bg-orange-400/10 text-orange-100',
  deny: 'border-rose-300/25 bg-rose-400/10 text-rose-100',
}

export default async function ControlSurfacePage() {
  const access = resolveHallOGridAccessFromServer()

  if (access.isReadOnlyPreview) {
    return (
      <div className="space-y-8 pb-10">
        <section className="surface-card-strong p-8">
          <div className="eyebrow">Operator control surface</div>
          <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">
            This lane is restricted to the operator console.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
            Public visitors should see the preview mirror, not raw command-center state,
            assurance detail, adapters, or proof internals.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="/console"
              className="rounded-2xl border border-cyan-300/20 bg-cyan-300/8 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-300/12"
            >
              Open Preview Console
            </a>
            <a
              href={access.upgradeUrl}
              className="rounded-2xl bg-gradient-to-r from-emerald-300 via-cyan-300 to-sky-400 px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-slate-950 transition hover:brightness-105"
            >
              Unlock Operator Access
            </a>
          </div>
        </section>
      </div>
    )
  }

  const snapshot = await getControlPlaneSnapshot()

  return (
    <div className="space-y-8 pb-10">
      <section className="surface-card-strong p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="eyebrow">Operator control surface</div>
            <h1 className="text-4xl font-semibold text-white sm:text-5xl">Decision theater, adapter truth, and provenance honesty.</h1>
            <p className="max-w-3xl text-base leading-7 text-slate-300">
              This surface is bound to the engine’s runtime outputs. It shows what is live, what is simulated, what is degraded, which adapter/control point produced the decision, and whether the authority layer is operational or assurance-ready.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="surface-card p-4">
              <div className="eyebrow">System status</div>
              <div className="mt-2 text-2xl font-semibold text-white">{snapshot.health?.status ?? 'unknown'}</div>
            </div>
            <div className="surface-card p-4">
              <div className="eyebrow">Assurance</div>
              <div className="mt-2 text-2xl font-semibold text-white">{snapshot.health?.assurance?.status ?? 'unknown'}</div>
            </div>
            <div className="surface-card p-4">
              <div className="eyebrow">Recent frames</div>
              <div className="mt-2 text-2xl font-semibold text-white">{snapshot.totalDecisions}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="surface-card p-6">
          <div className="eyebrow">Router core panel</div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <div className="text-sm text-slate-400">p50 total latency</div>
              <div className="mt-2 text-2xl font-semibold text-white">{formatMs(snapshot.slo?.currentMs.total.p50)}</div>
            </div>
            <div>
              <div className="text-sm text-slate-400">p95 total latency</div>
              <div className="mt-2 text-2xl font-semibold text-white">{formatMs(snapshot.slo?.currentMs.total.p95)}</div>
            </div>
            <div>
              <div className="text-sm text-slate-400">p95 compute latency</div>
              <div className="mt-2 text-2xl font-semibold text-white">{formatMs(snapshot.slo?.currentMs.compute.p95)}</div>
            </div>
            <div>
              <div className="text-sm text-slate-400">Decision samples</div>
              <div className="mt-2 text-2xl font-semibold text-white">{snapshot.slo?.counts.totalSamples ?? 0}</div>
            </div>
          </div>
          <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-sm text-slate-300">
            <span className="font-medium text-white">Budget:</span> total p95 {formatMs(snapshot.health?.sloBudgetMs.totalP95)} and compute p95 {formatMs(snapshot.health?.sloBudgetMs.computeP95)}. The surface shows actuals, not just targets.
          </div>
        </div>

        <div className="surface-card p-6">
          <div className="eyebrow">MSS / signal fabric</div>
          <div className="mt-5 space-y-4">
            {snapshot.methodologyProviders?.providers?.length ? (
              snapshot.methodologyProviders.providers.map((provider) => (
                <div key={provider.name} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="font-semibold text-white">{provider.name}</div>
                    <span className="pill border-white/10 bg-white/5 text-slate-200">{provider.status}</span>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-slate-400 sm:grid-cols-2">
                    <div>Last latency: {formatMs(provider.latencyMs)}</div>
                    <div>Last success: {provider.lastSuccessAt ? new Date(provider.lastSuccessAt).toLocaleString() : 'n/a'}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/15 p-4 text-sm text-slate-400">
                Provider methodology data is unavailable.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="surface-card p-6">
          <div className="eyebrow">Decision stack</div>
          <div className="mt-5 grid gap-4">
            {snapshot.decisions.length ? (
              snapshot.decisions.map((decision) => {
                const sourceMode = classifySourceMode({
                  decisionMode: decision.decisionMode,
                  fallbackUsed: decision.fallbackUsed,
                })
                const adapterId =
                  (decision.adapterContext as { adapterId?: string } | null)?.adapterId ??
                  (decision.decisionEnvelope as { transport?: { adapterId?: string } } | null)?.transport?.adapterId ??
                  'unknown'

                return (
                  <div key={decision.decisionFrameId} className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className={`pill ${actionTone[decision.action] ?? 'border-white/10 bg-white/5 text-white'}`}>
                            {decision.action.replace('_', ' ')}
                          </span>
                          <span className="pill border-white/10 bg-white/5 text-slate-200">{sourceMode}</span>
                          <span className="font-mono text-xs text-slate-500">{decision.decisionFrameId}</span>
                        </div>
                        <div>
                          <div className="text-2xl font-semibold text-white">{decision.selectedRegion}</div>
                          <div className="mt-1 text-sm text-slate-400">{decision.reasonCode}</div>
                        </div>
                      </div>
                      <div className="grid gap-3 text-sm text-slate-300 sm:grid-cols-2 lg:min-w-[300px]">
                        <div>Carbon delta: {formatPct(decision.savings)}</div>
                        <div>Water stress: {decision.waterStressIndex.toFixed(2)}</div>
                        <div>Authority: {decision.waterAuthorityMode}</div>
                        <div>Latency: {formatMs(decision.latencyMs?.total)}</div>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-400 sm:grid-cols-2">
                      <div>Signal mode: <span className="text-slate-200">{decision.signalMode}</span></div>
                      <div>Accounting: <span className="text-slate-200">{decision.accountingMethod}</span></div>
                      <div>Scenario: <span className="text-slate-200">{decision.waterScenario}</span></div>
                      <div>Adapter: <span className="text-slate-200">{adapterId}</span></div>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="rounded-2xl border border-dashed border-white/15 p-6 text-sm text-slate-400">
                No persisted decision frames are available yet.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="surface-card p-6">
            <div className="eyebrow">Proof panel</div>
            {snapshot.latestDecision ? (
              <div className="mt-5 space-y-4 text-sm text-slate-300">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Proof hash</div>
                  <div className="mt-2 break-all font-mono text-xs text-slate-200">{snapshot.latestDecision.proofHash ?? 'missing'}</div>
                </div>
                <div>Evidence refs: {(snapshot.latestDecision.waterEvidenceRefs ?? []).length}</div>
                <div>Fallback used: {snapshot.latestDecision.fallbackUsed ? 'yes' : 'no'}</div>
                <div>Not before: {snapshot.latestDecision.notBefore ?? 'immediate'}</div>
              </div>
            ) : (
              <div className="mt-5 text-sm text-slate-400">Proof appears here after the engine persists decision frames.</div>
            )}
          </div>

          <div className="surface-card p-6">
            <div className="eyebrow">Replay drawer</div>
            {snapshot.replay ? (
              <div className="mt-5 space-y-3 text-sm text-slate-300">
                <div>Consistent replay: <span className="text-white">{snapshot.replay.consistent ? 'yes' : 'no'}</span></div>
                <div>Mismatches: {snapshot.replay.mismatches?.length ?? 0}</div>
              </div>
            ) : (
              <div className="mt-5 text-sm text-slate-400">
                Replay data is unavailable on this surface unless the dashboard has an internal engine key configured.
              </div>
            )}
          </div>

            {snapshot.telemetry?.otel.enabled ? (
              <div className="surface-card p-6">
                <div className="eyebrow">OTel bridge</div>
                <div className="mt-5 space-y-4 text-sm text-slate-300">
                  <div>Export enabled: <span className="text-white">yes</span></div>
                  <div>Service name: <span className="text-white">{snapshot.telemetry?.otel.serviceName ?? 'n/a'}</span></div>
                  <div>Metric series: <span className="text-white">{snapshot.telemetry?.metrics?.metrics.length ?? 0}</span></div>
                </div>
              </div>
            ) : null}
          </div>
        </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="surface-card p-6">
          <div className="eyebrow">Adapter plane</div>
          <div className="mt-5 space-y-3 text-sm text-slate-300">
            {snapshot.adapters?.adapters?.map((adapter) => (
              <div key={adapter.id} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                <div className="font-semibold text-white">{adapter.runtime}</div>
                <div className="mt-2 font-mono text-xs text-slate-400">{adapter.id}</div>
              </div>
            )) ?? 'Adapter metadata unavailable.'}
          </div>
        </div>
        <div className="surface-card p-6">
          <div className="eyebrow">Provenance</div>
          <div className="mt-5 space-y-3 text-sm text-slate-300">
            <div>Verified: <span className="text-white">{snapshot.provenance?.summary.verified ?? 0}</span></div>
            <div>Unverified: <span className="text-white">{snapshot.provenance?.summary.unverified ?? 0}</span></div>
            <div>Missing source: <span className="text-white">{snapshot.provenance?.summary.missingSource ?? 0}</span></div>
            <div>Mismatch: <span className="text-white">{snapshot.provenance?.summary.mismatch ?? 0}</span></div>
          </div>
        </div>
        <div className="surface-card p-6">
          <div className="eyebrow">Water authority</div>
          <div className="mt-5 space-y-4 text-sm text-slate-300">
            <div>Bundle version: <span className="text-white">{snapshot.waterProviders?.bundleVersion ?? 'n/a'}</span></div>
            <div>Source count: <span className="text-white">{snapshot.waterProviders?.authorityStatus.sourceCount ?? 0}</span></div>
            <div>Dataset hashes present: <span className="text-white">{snapshot.waterProviders?.authorityStatus.datasetHashesPresent ? 'yes' : 'no'}</span></div>
          </div>
        </div>
      </section>

      <section className="surface-card p-6">
        <div className="eyebrow">Event timeline</div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
            <div className="text-sm font-semibold text-white">Health event</div>
            <p className="mt-2 text-sm text-slate-400">
              Database {snapshot.health?.checks.database ? 'available' : 'degraded'}; water artifacts {snapshot.health?.checks.waterArtifacts.schemaCompatible ? 'schema-compatible' : 'degraded'}.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
            <div className="text-sm font-semibold text-white">Assurance event</div>
            <p className="mt-2 text-sm text-slate-400">
              {snapshot.health?.assurance?.status === 'assurance_ready'
                ? 'Verified dataset hashes are present for the live authority layer.'
                : `Operational only; unhashed datasets: ${(snapshot.health?.assurance?.unhashedDatasets ?? []).join(', ') || 'none reported'}.`}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
            <div className="text-sm font-semibold text-white">Latency event</div>
            <p className="mt-2 text-sm text-slate-400">
              Total p95 {formatMs(snapshot.slo?.currentMs.total.p95)} against budget {formatMs(snapshot.health?.sloBudgetMs.totalP95)}.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
