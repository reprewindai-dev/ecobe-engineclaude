'use client'

import { useEffect, useMemo, useState } from 'react'

import { useControlSurfaceOverview, useReplayBundle } from '@/lib/hooks/control-surface'
import { latencyToneClass } from '@/lib/control-surface/labels'
import type { CiRouteResponse } from '@/types/control-surface'
import { EducationModeToggle } from './EducationModeToggle'
import { EventTimeline } from './EventTimeline'
import { GlobalImpactPanel } from './GlobalImpactPanel'
import { LiveDecisionTheater } from './LiveDecisionTheater'
import { MSSStatusPanel } from './MSSStatusPanel'
import { ProofPanel } from './ProofPanel'
import { ReplayDrawer } from './ReplayDrawer'
import { RouterCorePanel } from './RouterCorePanel'
import { ScenarioPlanningPanel } from './ScenarioPlanningPanel'
import { SimulationPanel } from './SimulationPanel'
import { DecisionStack } from './DecisionStack'

export function ControlSurfaceShell() {
  const overviewQuery = useControlSurfaceOverview()
  const [explainSimply, setExplainSimply] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedDecisionFrameId, setSelectedDecisionFrameId] = useState<string | null>(null)
  const [simulationDecision, setSimulationDecision] = useState<CiRouteResponse | null>(null)

  const overview = overviewQuery.data

  useEffect(() => {
    if (!selectedDecisionFrameId && overview?.decisions?.length) {
      setSelectedDecisionFrameId(overview.decisions[0].decisionFrameId)
    }
  }, [overview, selectedDecisionFrameId])

  const replayQuery = useReplayBundle(selectedDecisionFrameId)

  const activeReplay = useMemo(() => {
    if (!selectedDecisionFrameId) return overview?.replay ?? null
    if (replayQuery.data) return replayQuery.data
    if (overview?.replay?.decisionFrameId === selectedDecisionFrameId) return overview.replay
    return null
  }, [overview?.replay, replayQuery.data, selectedDecisionFrameId])

  const focusDecision =
    simulationDecision ??
    activeReplay?.replay ??
    activeReplay?.persisted ??
    overview?.liveDecision ??
    null

  if (overviewQuery.isLoading) {
    return (
      <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-8 text-sm text-slate-300">
        Loading Control Surface...
      </div>
    )
  }

  if (overviewQuery.error || !overview || !focusDecision) {
    return (
      <div className="rounded-[32px] border border-rose-400/20 bg-rose-400/10 p-8 text-sm text-rose-200">
        {overviewQuery.error instanceof Error
          ? overviewQuery.error.message
          : 'Failed to load the Control Surface'}
      </div>
    )
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-white/10 bg-white/[0.03] px-5 py-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.26em] text-cyan-300">Control Surface</div>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl">
              The system that decides where compute runs.
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              Live engine status: {overview.service.status}. {overview.service.detail}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
              <span className={`rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 ${latencyToneClass(overview.metrics.currentTotalMs)}`}>
                current warm path {overview.metrics.currentTotalMs.toFixed(0)}ms
              </span>
              <span className={`rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 ${latencyToneClass(overview.metrics.p50TotalMs)}`}>
                rolling p50 {overview.metrics.p50TotalMs.toFixed(0)}ms
              </span>
              <span className={`rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 ${latencyToneClass(overview.metrics.p95TotalMs)}`}>
                rolling p95 {overview.metrics.p95TotalMs.toFixed(0)}ms
              </span>
              <span className={`rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 ${latencyToneClass(overview.metrics.p99TotalMs)}`}>
                rolling p99 {overview.metrics.p99TotalMs.toFixed(0)}ms
              </span>
            </div>
          </div>
          <EducationModeToggle enabled={explainSimply} onToggle={() => setExplainSimply((value) => !value)} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
          <div className="space-y-6">
            <LiveDecisionTheater decision={focusDecision} explainSimply={explainSimply} />
            <RouterCorePanel decision={focusDecision} />
            <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <GlobalImpactPanel
                impact={overview.impact}
                distribution={overview.actionDistribution}
                metrics={overview.metrics}
              />
              <MSSStatusPanel
                providers={overview.providers}
                health={overview.health}
                outbox={overview.outbox}
              />
            </div>
            <ProofPanel
              decision={focusDecision}
              replay={activeReplay}
              explainSimply={explainSimply}
              onOpenReplay={() => setDrawerOpen(true)}
            />
            <ScenarioPlanningPanel previews={overview.scenarioPreviews} />
            <EventTimeline events={overview.timeline} />
          </div>

          <div className="space-y-6">
            <DecisionStack
              decisions={overview.decisions}
              selectedDecisionFrameId={selectedDecisionFrameId}
              explainSimply={explainSimply}
              onSelect={(decisionFrameId) => {
                setSelectedDecisionFrameId(decisionFrameId)
                setSimulationDecision(null)
              }}
            />
            <SimulationPanel
              defaults={overview.simulationDefaults}
              onSimulation={(decision) => {
                setSimulationDecision(decision)
                setDrawerOpen(false)
              }}
            />
          </div>
        </div>
      </div>
      <ReplayDrawer open={drawerOpen} replay={activeReplay} onClose={() => setDrawerOpen(false)} />
    </>
  )
}
