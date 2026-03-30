'use client'

import { motion } from 'framer-motion'

import type { ControlSurfaceProviderNode } from '@/types/control-surface'

export function SignalDoctrineSection({
  providers,
}: {
  providers: ControlSurfaceProviderNode[]
}) {
  return (
    <section className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
      <div className="max-w-3xl">
        <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-300">Signals, governance, and fallback discipline</div>
        <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl">
          Signals degrade. Execution authority does not.
        </h2>
        <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-base">
          Carbon and water decisions stay defensible even when providers degrade. Live providers,
          mirrored fallbacks, and SAIQ governance keep the control plane deterministic and auditable
          instead of failing open.
        </p>
      </div>
      <div className="mt-8 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[28px] border border-white/8 bg-slate-950/60 p-5">
          <div className="space-y-3">
            {providers.slice(0, 6).map((provider, index) => (
              <motion.div
                key={provider.id}
                initial={{ opacity: 0, x: -8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05 }}
                className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3"
              >
                <div>
                  <div className="text-sm font-semibold text-white">{provider.label}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {provider.lineageCount} mirrored observations
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-semibold ${provider.status === 'healthy' ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {provider.status}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {provider.freshnessSec == null ? 'freshness n/a' : `${provider.freshnessSec}s`}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
        <div className="rounded-[28px] border border-cyan-300/12 bg-[radial-gradient(circle_at_center,rgba(45,212,191,0.12),transparent_60%),rgba(2,8,23,0.84)] p-5">
          <div className="grid h-full gap-5 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <div className="space-y-4">
              {['WattTime', 'Ember', 'Water bundle'].map((name) => (
                <div key={name} className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white">
                  {name}
                </div>
              ))}
            </div>
            <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-300/8 text-center text-sm font-bold uppercase tracking-[0.2em] text-cyan-100">
              SAIQ + Policy
            </div>
            <div className="space-y-4">
              {['Binding decision', 'Proof refs', 'Replay posture'].map((name) => (
                <div key={name} className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white">
                  {name}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
