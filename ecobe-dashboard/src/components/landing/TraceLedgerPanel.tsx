'use client'

import type { LiveSystemSnapshot } from '@/types/control-surface'

function compactHash(value: string | null) {
  if (!value) return 'unavailable'
  if (value.length <= 18) return value
  return `${value.slice(0, 12)}…${value.slice(-6)}`
}

export function TraceLedgerPanel({
  traceLedger,
}: {
  traceLedger: LiveSystemSnapshot['traceLedger']
}) {
  return (
    <article className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
      <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-300">Trace Ledger</div>
      {!traceLedger.available ? (
        <p className="mt-4 text-sm leading-7 text-slate-300">
          {traceLedger.error ?? 'Trace ledger state is unavailable.'}
        </p>
      ) : (
        <div className="mt-4 space-y-3 text-sm text-slate-300">
          <div className="flex items-center justify-between gap-3">
            <span>traceAvailable</span>
            <span className="font-semibold text-white">
              {traceLedger.traceAvailable ? 'yes' : 'no'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>replay consistency</span>
            <span className="font-semibold text-white">
              {traceLedger.replayConsistent == null
                ? 'unavailable'
                : traceLedger.replayConsistent
                  ? 'consistent'
                  : 'mismatch'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>proof availability</span>
            <span className="font-semibold text-white">
              {traceLedger.proofAvailable ? 'available' : 'missing'}
            </span>
          </div>
          <div className="pt-2 text-[11px] uppercase tracking-[0.16em] text-slate-500">
            sequence {traceLedger.sequenceNumber ?? 'n/a'}
          </div>
          <div className="text-xs text-slate-400">trace {compactHash(traceLedger.traceHash)}</div>
          <div className="text-xs text-slate-400">
            input {compactHash(traceLedger.inputSignalHash)}
          </div>
        </div>
      )}
    </article>
  )
}
