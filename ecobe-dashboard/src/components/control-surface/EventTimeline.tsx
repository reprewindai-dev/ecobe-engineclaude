'use client'

import { formatDistanceToNowStrict } from 'date-fns'

import type { ControlSurfaceTimelineEvent } from '@/types/control-surface'

export function EventTimeline({
  events,
}: {
  events: ControlSurfaceTimelineEvent[]
}) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
      <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">Event spine</div>
      <h3 className="mt-2 text-xl font-bold text-white">System journal</h3>
      <div className="mt-5 space-y-3">
        {events.map((event) => (
          <div
            key={event.id}
            className="flex gap-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4"
          >
            <div
              className={`mt-1 h-2.5 w-2.5 rounded-full ${
                event.severity === 'critical'
                  ? 'bg-rose-400'
                  : event.severity === 'warning'
                    ? 'bg-amber-300'
                    : event.severity === 'success'
                      ? 'bg-emerald-300'
                      : 'bg-cyan-300'
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-semibold text-white">{event.label}</div>
                <div className="text-xs text-slate-500">
                  {formatDistanceToNowStrict(new Date(event.timestamp), { addSuffix: true })}
                </div>
              </div>
              <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">{event.type}</div>
              <div className="mt-3 text-sm text-slate-300">{event.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
