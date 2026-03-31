'use client'

import { formatAction } from '@/components/control-surface/action-styles'
import type { ActionDistributionItem } from '@/types/control-surface'

export function ActionDistributionMiniChart({
  distribution,
}: {
  distribution: ActionDistributionItem[]
}) {
  return (
    <div className="space-y-3">
      {distribution.map((item) => {
        const meta = formatAction(item.action)
        return (
          <div key={item.action}>
            <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
              <span>{meta.label}</span>
              <span>{item.count} / {item.pct.toFixed(1)}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/6">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-300 via-cyan-300 to-sky-400"
                style={{ width: `${Math.max(item.pct, 5)}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

