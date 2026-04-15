/**
 * Doctrine consumption entry point for the CI decision engine.
 * Call resolveDoctrineForOrg() inside evaluateCandidates() and
 * attach the returned doctrineVersionId to the CIDecision record.
 *
 * Engine behavior with doctrine:
 *  - carbonThreshold: block any region with carbonIntensity > threshold
 *  - waterThreshold: block any region with scarcityImpact > threshold
 *  - latencyBudget: add a hard penalty for regions that would exceed budget
 *  - costCeiling: block if costWeight-adjusted score exceeds ceiling
 *  - mode 'strict': all thresholds are hard blocks
 *  - mode 'balanced': thresholds become score penalties (x3 multiplier)
 *  - mode 'permissive': thresholds are warnings only, never block
 */
export { getActiveDoctrine, invalidateDoctrine } from './doctrine-cache'
export type { ActiveDoctrine } from './doctrine-cache'

import { getActiveDoctrine } from './doctrine-cache'
import type { ActiveDoctrine } from './doctrine-cache'

export type DoctrineResolution = {
  doctrineVersionId: string | null
  doctrine: ActiveDoctrine | null
  source: 'db_cache' | 'default'
}

export async function resolveDoctrineForOrg(orgId: string): Promise<DoctrineResolution> {
  if (!orgId) return { doctrineVersionId: null, doctrine: null, source: 'default' }

  const doctrine = await getActiveDoctrine(orgId).catch(() => null)
  if (!doctrine) return { doctrineVersionId: null, doctrine: null, source: 'default' }

  return {
    doctrineVersionId: doctrine.id,
    doctrine,
    source: 'db_cache',
  }
}

export function applyDoctrineThresholds(
  candidates: Array<{
    region: string
    carbonIntensity: number
    scarcityImpact: number
    score: number
  }>,
  doctrine: ActiveDoctrine | null
): Array<{
  region: string
  carbonIntensity: number
  scarcityImpact: number
  score: number
  doctrineBlocked: boolean
  doctrineReason: string | null
}> {
  if (!doctrine) {
    return candidates.map((c) => ({ ...c, doctrineBlocked: false, doctrineReason: null }))
  }

  const strict = doctrine.mode === 'strict'
  const balanced = doctrine.mode === 'balanced'

  return candidates.map((c) => {
    let doctrineBlocked = false
    const reasons: string[] = []
    let adjustedScore = c.score

    if (doctrine.carbonThreshold !== null && c.carbonIntensity > doctrine.carbonThreshold) {
      if (strict) {
        doctrineBlocked = true
        reasons.push(`carbon_threshold_exceeded:${c.carbonIntensity}>${doctrine.carbonThreshold}`)
      } else if (balanced) {
        adjustedScore = adjustedScore * 3
        reasons.push(`carbon_threshold_penalty:${c.carbonIntensity}>${doctrine.carbonThreshold}`)
      } else {
        reasons.push(`carbon_threshold_warning:${c.carbonIntensity}>${doctrine.carbonThreshold}`)
      }
    }

    if (doctrine.waterThreshold !== null && c.scarcityImpact > doctrine.waterThreshold) {
      if (strict) {
        doctrineBlocked = true
        reasons.push(`water_threshold_exceeded:${c.scarcityImpact}>${doctrine.waterThreshold}`)
      } else if (balanced) {
        adjustedScore = adjustedScore * 3
        reasons.push(`water_threshold_penalty:${c.scarcityImpact}>${doctrine.waterThreshold}`)
      } else {
        reasons.push(`water_threshold_warning:${c.scarcityImpact}>${doctrine.waterThreshold}`)
      }
    }

    return {
      ...c,
      score: adjustedScore,
      doctrineBlocked,
      doctrineReason: reasons.length > 0 ? reasons.join(';') : null,
    }
  })
}
