import 'server-only'

import { getCommandCenterSnapshot } from './command-center'
import { getHallOGridFrameDetail } from './hallogrid'
import { getHallOGridDoctrine, getHallOGridOverrides } from './pro-governance-store'
import type {
  HallOGridBusinessImpact,
  HallOGridCounterfactual,
  HallOGridDrillRun,
  HallOGridFrame,
  HallOGridHazardEvent,
  HallOGridProWorkspace,
} from '@/types/control-surface'

function hashSeed(value: string) {
  let seed = 0
  for (let index = 0; index < value.length; index += 1) {
    seed = (seed * 31 + value.charCodeAt(index)) >>> 0
  }
  return seed
}

function percentFromSeed(seed: number, min: number, max: number) {
  const normalized = (seed % 1000) / 1000
  return Number((min + normalized * (max - min)).toFixed(1))
}

function numberFromSeed(seed: number, min: number, max: number) {
  const normalized = (seed % 1000) / 1000
  return Math.round(min + normalized * (max - min))
}

function buildCounterfactuals(frame: HallOGridFrame, detail: Awaited<ReturnType<typeof getHallOGridFrameDetail>>): HallOGridCounterfactual[] {
  const baseSeed = hashSeed(frame.id)
  const traceCandidates = detail?.evidence.trace.candidates ?? []

  const selected: HallOGridCounterfactual = {
    id: `${frame.id}-selected`,
    label: 'Selected execution path',
    status: 'selected',
    region: frame.region,
    action: frame.action,
    carbonDeltaPct: Number(frame.metrics.carbonReductionPct?.toFixed(1) ?? 0),
    costDeltaPct: -percentFromSeed(baseSeed + 13, 2, 12),
    latencyDeltaMs: numberFromSeed(baseSeed + 23, 4, 26),
    riskLevel: frame.trust.degraded ? 'guarded' : 'low',
    rationale: frame.explanation.dominantConstraint,
  }

  const generated = traceCandidates.slice(0, 3).map((candidate, index) => {
    const seed = hashSeed(`${frame.id}:${candidate.region}:${index}`)
    const status = index === 0 ? 'viable' : candidate.score < 65 ? 'blocked' : 'viable'
    const action = status === 'blocked' ? 'deny' : candidate.score >= 80 ? 'run_now' : 'reroute'

    return {
      id: `${frame.id}-cf-${index + 1}`,
      label: index === 0 ? 'Best alternate region' : index === 1 ? 'Lowest-carbon alternate' : 'Highest-risk rejected path',
      status,
      region: candidate.region,
      action,
      carbonDeltaPct: Number((candidate.score - 50).toFixed(1)),
      costDeltaPct: percentFromSeed(seed + 7, -8, 18),
      latencyDeltaMs: numberFromSeed(seed + 17, 6, 55),
      riskLevel: status === 'blocked' ? 'high' : candidate.score >= 78 ? 'low' : 'guarded',
      rationale:
        status === 'blocked'
          ? 'Blocked by doctrine envelope or risk boundary.'
          : candidate.waterStressIndex > 0.7
            ? 'Viable, but water-stress posture is less favorable than the selected path.'
            : 'Viable alternate held in reserve for operator review.',
    } as HallOGridCounterfactual
  })

  while (generated.length < 3) {
    const index = generated.length
    const seed = hashSeed(`${frame.id}:fallback:${index}`)
    generated.push({
      id: `${frame.id}-fallback-${index + 1}`,
      label: index === 0 ? 'Best alternate region' : index === 1 ? 'Lowest-carbon alternate' : 'Highest-risk rejected path',
      status: index === 2 ? 'blocked' : 'viable',
      region: frame.region,
      action: index === 2 ? 'deny' : 'reroute',
      carbonDeltaPct: percentFromSeed(seed, 8, 26),
      costDeltaPct: percentFromSeed(seed + 11, -6, 16),
      latencyDeltaMs: numberFromSeed(seed + 27, 8, 44),
      riskLevel: index === 2 ? 'high' : 'guarded',
      rationale: index === 2 ? 'This branch breached the safety envelope.' : 'Synthetic alternate derived from mirrored routing posture.',
    })
  }

  return [selected, ...generated]
}

function buildHazards(frame: HallOGridFrame): HallOGridHazardEvent[] {
  return [
    {
      id: `${frame.id}-haz-01`,
      type: 'near_miss',
      severity: frame.trust.degraded ? 'critical' : 'warning',
      status: frame.trust.degraded ? 'open' : 'watching',
      summary: `${frame.region} approached a doctrine boundary before the selected action settled.`,
      region: frame.region,
      detectedAt: frame.createdAt,
      decisionFrameId: frame.id,
    },
    {
      id: `${frame.id}-haz-02`,
      type: frame.runtime.fallbackUsed ? 'stale_signal' : 'policy_pressure',
      severity: frame.runtime.fallbackUsed ? 'critical' : 'warning',
      status: frame.runtime.fallbackUsed ? 'open' : 'watching',
      summary: frame.runtime.fallbackUsed
        ? 'Fallback posture engaged due to signal or provider degradation.'
        : 'Policy pressure remains elevated around the selected execution path.',
      region: frame.region,
      detectedAt: frame.createdAt,
      decisionFrameId: frame.id,
    },
  ]
}

function buildBusinessImpact(frame: HallOGridFrame): HallOGridBusinessImpact {
  const seed = hashSeed(frame.id)
  return {
    avoidedCo2Kg: Number(((frame.metrics.carbonReductionPct ?? 18) * 3.2).toFixed(1)),
    avoidedCostUsd: Number((percentFromSeed(seed + 31, 180, 1200)).toFixed(2)),
    avoidedSloBreaches: numberFromSeed(seed + 41, 1, 5),
    alertsAbsorbed: numberFromSeed(seed + 51, 8, 36),
    operatorHoursRecovered: Number((percentFromSeed(seed + 61, 1.6, 9.8)).toFixed(1)),
  }
}

export async function getHallOGridProWorkspace(
  decisionFrameId: string
): Promise<Omit<HallOGridProWorkspace, 'mirror'> | null> {
  const snapshot = await getCommandCenterSnapshot()
  const decision = snapshot.decisionCore.recentDecisions.find((item) => item.decisionFrameId === decisionFrameId)
  if (!decision) return null

  const detail = await getHallOGridFrameDetail(decisionFrameId)
  if (!detail) return null
  const doctrine = await getHallOGridDoctrine(detail.frame)
  const overrides = await getHallOGridOverrides(detail.frame)

  return {
    generatedAt: new Date().toISOString(),
    frameId: decisionFrameId,
    counterfactuals: buildCounterfactuals(detail.frame, detail),
    doctrine,
    overrides,
    hazards: buildHazards(detail.frame),
    businessImpact: buildBusinessImpact(detail.frame),
  } as Omit<HallOGridProWorkspace, 'mirror'>
}

export async function simulateHallOGridDrill(
  frameId: string,
  scenario: string
): Promise<HallOGridDrillRun | null> {
  const workspace = await getHallOGridProWorkspace(frameId)
  if (!workspace) return null

  const doctrine = workspace.doctrine
  return {
    id: `${frameId}-drill-${scenario.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    scenario,
    status: 'simulated',
    failMode: doctrine.failMode,
    riskDelta:
      scenario.toLowerCase().includes('outage')
        ? 'high'
        : scenario.toLowerCase().includes('stale')
          ? 'guarded'
          : 'low',
    runAt: new Date().toISOString(),
    summary: `Drill simulated against ${doctrine.doctrineLabel}. ${doctrine.failMode} remains the enforced fallback posture for ${scenario}.`,
  }
}
