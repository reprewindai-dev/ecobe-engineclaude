'use client'

import type { ScenarioPreview } from '@/types/control-surface'

export function ScenarioPlanningPanel({ previews }: { previews: ScenarioPreview[] }) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
      <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">Scenario planning</div>
      <h3 className="mt-2 text-xl font-bold text-white">Previewed water futures</h3>
      <div className="mt-5 grid gap-3">
        {previews.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/8 bg-white/[0.03] px-4 py-5 text-sm text-slate-400">
            Scenario previews are temporarily unavailable.
          </div>
        ) : (
          previews.map((preview) => (
            <div
              key={preview.scenario}
              className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-white">{preview.scenario}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {preview.decision} in {preview.selectedRegion}
                  </div>
                </div>
                <div className="text-right text-xs text-slate-400">
                  {preview.executable ? 'executable' : 'preview only'}
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-3">
                <div>Carbon delta: {preview.carbonReductionPct.toFixed(2)}%</div>
                <div>Water delta: {preview.waterImpactDeltaLiters.toFixed(2)}L</div>
                <div className="truncate">Proof: {preview.proofHash}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
