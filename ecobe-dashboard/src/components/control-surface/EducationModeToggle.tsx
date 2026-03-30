'use client'

export function EducationModeToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex items-center gap-3 rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition ${
        enabled
          ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-200'
          : 'border-white/10 bg-white/[0.03] text-slate-300'
      }`}
    >
      <span
        className={`h-2.5 w-2.5 rounded-full ${
          enabled ? 'bg-cyan-300 shadow-[0_0_16px_rgba(103,232,249,0.55)]' : 'bg-slate-500'
        }`}
      />
      Explain this simply
    </button>
  )
}

