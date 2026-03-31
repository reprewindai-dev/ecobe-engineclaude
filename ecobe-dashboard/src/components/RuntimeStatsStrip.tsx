'use client'

import { useEffect, useState } from 'react'

type RuntimeStatsStripProps = {
  decisionsEvaluated: number
  activeRegions: number
  avgDecisionTimeMs: number
  policyChecksExecuted: number
  proofRecordsGenerated: number
}

function formatCount(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}

export function RuntimeStatsStrip({
  decisionsEvaluated,
  activeRegions,
  avgDecisionTimeMs,
  policyChecksExecuted,
  proofRecordsGenerated,
}: RuntimeStatsStripProps) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTick((current) => current + 1)
    }, 3500)

    return () => window.clearInterval(interval)
  }, [])

  const stats = [
    {
      label: 'Decisions evaluated',
      value: formatCount(decisionsEvaluated + tick),
    },
    {
      label: 'Active regions',
      value: formatCount(activeRegions),
    },
    {
      label: 'Avg decision time',
      value: `${avgDecisionTimeMs} ms`,
    },
    {
      label: 'Policy checks executed',
      value: formatCount(policyChecksExecuted + tick * 2),
    },
    {
      label: 'Proof records generated',
      value: formatCount(proofRecordsGenerated + tick),
    },
  ]

  return (
    <section className="surface-card overflow-hidden p-4">
      <div className="grid gap-3 lg:grid-cols-5">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-5">
            <div className="eyebrow">{stat.label}</div>
            <div className="mt-3 text-2xl font-semibold text-white">{stat.value}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
