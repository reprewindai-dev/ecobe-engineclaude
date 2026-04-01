'use client'

import { motion } from 'framer-motion'

import { formatAction } from '@/components/control-surface/action-styles'
import type { ActionDistributionItem } from '@/types/control-surface'

const orderedActions = ['run_now', 'reroute', 'delay', 'throttle', 'deny'] as const

export function ActionStrip({
  distribution,
}: {
  distribution: ActionDistributionItem[]
}) {
  const distributionMap = new Map(distribution.map((item) => [item.action, item]))
  const hasLiveDistribution = distribution.length > 0

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {orderedActions.map((action, index) => {
        const meta = formatAction(action)
        const item = distributionMap.get(action)
        return (
          <motion.div
            key={action}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 * index }}
            className={`rounded-[24px] border bg-white/[0.04] p-4 backdrop-blur ${meta.border}`}
          >
            <div className="flex items-center justify-between">
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${meta.badge}`}>
                {meta.label}
              </span>
              <span className="text-xs text-slate-500">
                {hasLiveDistribution && item ? `${item.pct.toFixed(1)}%` : 'shell ready'}
              </span>
            </div>
            <div className="mt-4 text-sm text-slate-300">
              {hasLiveDistribution
                ? meta.simple
                : 'This action remains visible immediately. The live decision mix attaches without replacing the page.'}
            </div>
            <div className="mt-5 h-1.5 rounded-full bg-white/6">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-300 via-cyan-300 to-sky-400"
                style={{ width: `${hasLiveDistribution ? Math.max(item?.pct ?? 0, 6) : 22}%` }}
              />
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

