'use client'

import { AnimatePresence, motion } from 'framer-motion'

import type { ReplayBundle } from '@/types/control-surface'

export function ReplayDrawer({
  open,
  replay,
  onClose,
}: {
  open: boolean
  replay: ReplayBundle | null
  onClose: () => void
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className="fixed right-0 top-0 z-50 h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-[linear-gradient(180deg,rgba(2,8,23,0.98),rgba(6,12,24,0.98))] p-6 shadow-[0_0_120px_rgba(0,0,0,0.55)]"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.26em] text-cyan-300">Replay mode</div>
                <h3 className="mt-2 text-2xl font-bold text-white">Decision reconstruction</h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300"
              >
                Close
              </button>
            </div>

            {replay ? (
              <div className="mt-6 space-y-4">
                {[
                  {
                    label: 'Signals loaded',
                    detail: replay.replay.proofRecord.signals_used.join(' · '),
                  },
                  {
                    label: 'Policy checked',
                    detail: ((replay.replay.policyTrace.reasonCodes ?? []) as string[]).join(' · '),
                  },
                  {
                    label: 'Candidates evaluated',
                    detail: `${replay.replay.candidateEvaluations.length} candidate regions were scored.`,
                  },
                  {
                    label: 'Action chosen',
                    detail: `${replay.replay.decision} -> ${replay.replay.selectedRegion}`,
                  },
                  {
                    label: 'Proof created',
                    detail: `job_id ${replay.replay.proofRecord.job_id} at ${new Date(replay.replay.proofRecord.timestamp).toLocaleString()} | hash ${replay.replay.proofHash}`,
                  },
                ].map((step, index) => (
                  <div key={step.label} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      Step {index + 1}
                    </div>
                    <div className="mt-2 text-lg font-semibold text-white">{step.label}</div>
                    <div className="mt-2 text-sm text-slate-300">{step.detail || 'No detail available'}</div>
                  </div>
                ))}

                <div className="rounded-2xl border border-cyan-300/16 bg-cyan-300/8 p-4">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-cyan-200">Determinism</div>
                  <div className="mt-2 text-lg font-semibold text-white">
                    {replay.deterministicMatch ? 'Persisted and replayed outputs match.' : 'Live replay sample only.'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-slate-300">
                Replay is unavailable in this environment.
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
