'use client'

import { humanizeReasonCode, latencyToneClass } from '@/lib/control-surface/labels'
import type { CiRouteResponse, ReplayBundle } from '@/types/control-surface'

export function ProofPanel({
  decision,
  replay,
  explainSimply,
  onOpenReplay,
}: {
  decision: CiRouteResponse
  replay: ReplayBundle | null
  explainSimply: boolean
  onOpenReplay: () => void
}) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">Proof panel</div>
          <h3 className="mt-2 text-xl font-bold text-white">Why the engine did this</h3>
        </div>
        <button
          type="button"
          onClick={onOpenReplay}
          className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200"
        >
          View full replay
        </button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Baseline vs selected</div>
          <div className="mt-3 space-y-2 text-sm text-slate-300">
            <div>Decision mode: {decision.decisionMode.replace(/_/g, ' ')}</div>
            <div>Water authority: {decision.waterAuthority.authorityMode}</div>
            <div>Scenario: {decision.waterAuthority.scenario}</div>
            <div>Facility: {decision.waterAuthority.facilityId ?? 'basin only'}</div>
            <div>Baseline region: {decision.baseline.region}</div>
            <div>Selected region: {decision.selected.region}</div>
            <div>Carbon delta: {decision.proofRecord.carbon_delta.toFixed(2)}</div>
            <div>Water delta: {decision.proofRecord.water_delta.toFixed(2)}</div>
          </div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Latency envelope</div>
          <div className="mt-3 grid gap-2 text-sm text-slate-300">
            <div className={latencyToneClass(decision.latencyMs?.total)}>
              Total: {decision.latencyMs?.total?.toFixed(0) ?? '--'} ms
            </div>
            <div className={latencyToneClass(decision.latencyMs?.compute)}>
              Compute: {decision.latencyMs?.compute?.toFixed(0) ?? '--'} ms
            </div>
            <div>Providers: {decision.latencyMs?.providerResolution?.toFixed(0) ?? '--'} ms</div>
            <div>Cache mode: {decision.latencyMs?.cacheStatus ?? 'live'}</div>
            <div>
              Decision impact: {decision.latencyMs?.influencedDecision ? 'latency constrained the outcome' : 'latency stayed within doctrine'}
            </div>
            <div>
              Budget: {decision.latencyMs?.budget ? `${decision.latencyMs.budget.totalP95Ms}ms total / ${decision.latencyMs.budget.computeP95Ms}ms compute` : 'live budget unavailable'}
            </div>
            <div>
              Envelope: {decision.latencyMs?.withinEnvelope === false ? 'outside budget' : 'within budget'}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Capacity envelope</div>
        <div className="mt-3 grid gap-2 text-sm text-slate-300 md:grid-cols-2">
          <div>
            Target slot: {decision.capacity?.targetTime ? new Date(decision.capacity.targetTime).toLocaleString() : 'current slot'}
          </div>
          <div>Reserved: {decision.capacity?.reserved ? 'yes' : 'no'}</div>
          <div>Pressure: {decision.capacity?.pressureLevel ?? 'unknown'}</div>
          <div>Queue depth: {decision.capacity?.queueDepth ?? 0}</div>
          <div>CPU utilization: {decision.capacity ? `${(decision.capacity.cpuUtilization * 100).toFixed(1)}%` : '--'}</div>
          <div>Cost multiplier: {decision.capacity?.costMultiplier?.toFixed(2) ?? '1.00'}x</div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Signal lineage</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {decision.proofRecord.signals_used.map((signal) => (
            <span
              key={signal}
              className="rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[11px] text-slate-300"
            >
              {signal}
            </span>
          ))}
        </div>
        <div className="mt-3 text-xs text-slate-400">
          {Object.entries(decision.proofRecord.dataset_versions)
            .map(([key, value]) => `${key}:${value}`)
            .join(' | ')}
        </div>
        <div className="mt-3 text-xs text-slate-400">
          Signal mode: {decision.signalMode} | Accounting: {decision.accountingMethod}
        </div>
        <div className="mt-2 text-xs text-slate-400">
          Supplier authority: {decision.waterAuthority.supplierSet.join(', ')}
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Policy trace</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(decision.policyTrace.reasonCodes ?? []).map((reason) => (
            <span
              key={reason}
              className="rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[11px] text-slate-300"
            >
              {humanizeReasonCode(reason)}
            </span>
          ))}
        </div>
        <div className="mt-4 text-sm text-slate-300">
          {explainSimply
            ? 'This proof record keeps the before state, chosen state, latency envelope, and doctrine reasons attached to the decision.'
            : 'Proof stays attached to the decision frame so replay, audit, latency validation, and downstream evidence stay deterministic.'}
        </div>
        <div className="mt-3 text-xs text-slate-400">
          Proof hash: {decision.proofHash}
        </div>
        <div className="mt-2 text-xs text-slate-400">
          Evidence refs: {(decision.waterAuthority.evidenceRefs ?? []).join(' | ') || 'none'}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Proof timestamp</div>
          <div className="mt-2 text-sm font-semibold text-white">{new Date(decision.proofRecord.timestamp).toLocaleString()}</div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Replay status</div>
          <div className="mt-2 text-sm font-semibold text-white">
            {replay?.deterministicMatch ? 'deterministic match' : replay ? 'replay available' : 'live proof only'}
          </div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Enforcement / delivery</div>
          <div className="mt-2 text-sm font-semibold text-white">
            {decision.enforcementBundle?.githubActions.executable === false
              ? 'preview-only scenario plan'
              : decision.notBefore
                ? `deferred until ${new Date(decision.notBefore).toLocaleString()}`
                : replay
                  ? 'signed event path visible'
                  : 'awaiting internal replay surface'}
          </div>
        </div>
      </div>
    </section>
  )
}
