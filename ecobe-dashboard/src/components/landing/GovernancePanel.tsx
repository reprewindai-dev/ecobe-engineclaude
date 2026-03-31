'use client'

import { humanizeReasonCode } from '@/lib/control-surface/labels'
import type { LiveSystemSnapshot } from '@/types/control-surface'

export function GovernancePanel({
  governance,
}: {
  governance: LiveSystemSnapshot['governance']
}) {
  return (
    <article className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
      <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-300">Governance</div>
      {!governance.available ? (
        <p className="mt-4 text-sm leading-7 text-slate-300">
          {governance.error ?? 'Governance state is unavailable.'}
        </p>
      ) : (
        <div className="mt-4 space-y-3 text-sm text-slate-300">
          <div className="flex items-center justify-between gap-3">
            <span>{governance.frameworkLabel}</span>
            <span className="font-semibold text-white">
              {governance.active ? 'active' : 'inactive'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>policy state</span>
            <span className="font-semibold text-white">{governance.policyState ?? 'NONE'}</span>
          </div>
          <div className="pt-2 text-[11px] uppercase tracking-[0.16em] text-slate-500">
            latest decision
          </div>
          <div className="text-sm font-semibold uppercase tracking-[0.14em] text-white">
            {governance.latestDecisionAction?.replace(/_/g, ' ') ?? 'unavailable'}
          </div>
          <div className="text-sm text-slate-400">
            {governance.latestReasonCode
              ? humanizeReasonCode(governance.latestReasonCode)
              : 'No recent governance result is available.'}
          </div>
        </div>
      )}
    </article>
  )
}
