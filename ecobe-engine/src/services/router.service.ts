import { randomUUID } from 'crypto'
import { getSignals } from './fingard.service'
import { saveDecision, getRecentDecisions } from '../db/decision-log.repo'

export interface RouteRequest {
  workloadId: string
  candidateRegions: string[]
  durationMinutes?: number
  workloadType?: 'batch' | 'inference' | 'training'
}

export interface RoutingDecision {
  decision_id: string
  workload_id: string
  chosen_region: string
  candidate_regions: string[]
  winner_source: string
  winner_value: number
  worst_value: number
  carbon_delta: number
  degraded: boolean
  created_at: Date
}

/**
 * Core routing logic
 * Gets signals for all candidate regions and selects the best one
 */
export async function routeWorkload(request: RouteRequest): Promise<RoutingDecision> {
  const { workloadId, candidateRegions } = request

  // Get signals for all candidate regions
  const signals = await getSignals(candidateRegions)
  
  if (signals.length === 0) {
    throw new Error('No signals available for candidate regions')
  }

  // Find winner (lowest carbon value)
  const winnerSignal = signals.reduce((min, current) => 
    current.carbonValue < min.carbonValue ? current : min
  )

  // Find worst (highest carbon value)
  const worstSignal = signals.reduce((max, current) => 
    current.carbonValue > max.carbonValue ? current : max
  )

  // Create decision record
  const decision: RoutingDecision = {
    decision_id: randomUUID(),
    workload_id: workloadId,
    chosen_region: winnerSignal.region,
    candidate_regions: candidateRegions,
    winner_source: winnerSignal.source,
    winner_value: winnerSignal.carbonValue,
    worst_value: worstSignal.carbonValue,
    carbon_delta: worstSignal.carbonValue - winnerSignal.carbonValue,
    degraded: winnerSignal.degraded,
    created_at: new Date(),
  }

  // Save decision to log
  await saveDecision(decision)

  return decision
}
