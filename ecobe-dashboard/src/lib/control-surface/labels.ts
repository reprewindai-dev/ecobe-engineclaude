const REASON_LABELS: Record<string, string> = {
  REROUTE_WATER_GUARDRAIL: 'Water guardrail rerouted the job',
  DELAY_NO_SAFE_REGION: 'No safe region was available, so the job was delayed',
  DENY_NO_SAFE_REGION: 'No safe region was available, so the job was denied',
  THROTTLE_NO_SAFE_REGION: 'No safe region was available, so throughput was reduced',
  THROTTLE_CARBON_AND_CRITICALITY: 'Critical workload throttled under high carbon pressure',
  DB_PERSIST_FAILED_LOCAL_RESPONSE_ONLY: 'Decision persisted only to the live response path',
  REQUEST_VALIDATION_OR_RUNTIME_FAILURE: 'Fallback mode activated after request/runtime failure',
  FALLBACK_CONSERVATIVE_MODE: 'Conservative fallback mode active',
  SEKED_POLICY_ADAPTER_DISABLED_OR_UNCONFIGURED: 'SEKED adapter inactive',
  EXTERNAL_POLICY_HOOK_DISABLED_OR_UNCONFIGURED: 'External policy hook inactive',
  WATER_FALLBACK_CONSERVATIVE: 'Water fallback active',
  LOWEST_DEFENSIBLE_SIGNAL_PENALTY: 'Defensive signal penalty applied',
}

export function humanizeReasonCode(reason: string): string {
  if (REASON_LABELS[reason]) return REASON_LABELS[reason]

  return reason
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function formatFreshness(seconds: number | null): string {
  if (seconds == null || seconds < 0) return 'Mirror freshness unavailable'
  if (seconds < 60) return `${seconds}s fresh`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m fresh`
  return `${Math.round(seconds / 3600)}h fresh`
}

export function latencyToneClass(totalMs: number | null | undefined): string {
  if (totalMs == null) return 'text-slate-300'
  if (totalMs <= 100) return 'text-emerald-300'
  if (totalMs <= 250) return 'text-amber-300'
  return 'text-rose-300'
}
