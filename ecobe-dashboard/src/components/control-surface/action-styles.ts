import type { ControlAction } from '@/types/control-surface'

export const ACTION_META: Record<
  ControlAction,
  {
    label: string
    simple: string
    badge: string
    border: string
    text: string
    glow: string
  }
> = {
  run_now: {
    label: 'Run Now',
    simple: 'let the job run now',
    badge: 'bg-emerald-500/12 text-emerald-300',
    border: 'border-emerald-400/30',
    text: 'text-emerald-300',
    glow: 'shadow-[0_0_50px_rgba(45,212,191,0.18)]',
  },
  reroute: {
    label: 'Reroute',
    simple: 'send the job to a cleaner region',
    badge: 'bg-cyan-500/12 text-cyan-300',
    border: 'border-cyan-400/30',
    text: 'text-cyan-300',
    glow: 'shadow-[0_0_50px_rgba(34,211,238,0.18)]',
  },
  delay: {
    label: 'Delay',
    simple: 'wait for a cleaner window',
    badge: 'bg-amber-500/12 text-amber-300',
    border: 'border-amber-400/30',
    text: 'text-amber-300',
    glow: 'shadow-[0_0_50px_rgba(251,191,36,0.16)]',
  },
  throttle: {
    label: 'Throttle',
    simple: 'reduce throughput under policy pressure',
    badge: 'bg-violet-500/12 text-violet-300',
    border: 'border-violet-400/30',
    text: 'text-violet-300',
    glow: 'shadow-[0_0_50px_rgba(167,139,250,0.16)]',
  },
  deny: {
    label: 'Deny',
    simple: 'block the job until the policy is safe',
    badge: 'bg-rose-500/12 text-rose-300',
    border: 'border-rose-400/30',
    text: 'text-rose-300',
    glow: 'shadow-[0_0_50px_rgba(251,113,133,0.18)]',
  },
}

export function formatAction(action: ControlAction) {
  return ACTION_META[action]
}

