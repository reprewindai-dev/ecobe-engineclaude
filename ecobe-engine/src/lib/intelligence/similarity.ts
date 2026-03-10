import { buildFingerprint, generateWorkloadEmbedding, WorkloadFingerprint } from './fingerprint'
import { findSimilarWorkloads, WorkloadVectorMetadata } from './vector-store'
import type { CarbonCommandPayload } from '../carbon-command'
import { logIntelligenceEvent } from '../logger'
import { incrementSimilarityQueryCount } from './metrics'

export interface SimilarityInsight {
  similarWorkloadsFound: number
  averageCarbonSaved: number
  recommendedRegion?: string | null
  confidence: number
  neighbors: Array<{ metadata: WorkloadVectorMetadata; score: number }>
}

export interface SimilarityContext {
  fingerprint: WorkloadFingerprint
  embedding: number[]
  insight: SimilarityInsight
}

export async function analyzeSimilarWorkloads(payload: CarbonCommandPayload): Promise<SimilarityContext | null> {
  const fingerprint = buildFingerprint(payload)
  const embedding = await generateWorkloadEmbedding(fingerprint)
  if (!embedding) {
    return null
  }

  const neighbors = await findSimilarWorkloads(embedding, 10)
  if (neighbors.length === 0) {
    return {
      fingerprint,
      embedding,
      insight: {
        similarWorkloadsFound: 0,
        averageCarbonSaved: 0,
        recommendedRegion: null,
        confidence: 0.4,
        neighbors: [],
      },
    }
  }

  const averageCarbonSaved = avg(neighbors.map((neighbor: { metadata: WorkloadVectorMetadata }) => neighbor.metadata.carbonSaved ?? 0))
  const successRate = avg(neighbors.map((neighbor: { metadata: WorkloadVectorMetadata }) => (neighbor.metadata.success ? 1 : 0)))

  const regionScores: Record<string, { score: number; count: number }> = {}
  neighbors.forEach((neighbor: { metadata: WorkloadVectorMetadata; score: number }) => {
    const region = neighbor.metadata.regionChosen ?? 'unknown'
    if (!regionScores[region]) {
      regionScores[region] = { score: 0, count: 0 }
    }
    regionScores[region].score += neighbor.score
    regionScores[region].count += 1
  })

  const recommendedRegion = Object.entries(regionScores)
    .sort((a, b) => b[1].score - a[1].score)
    .at(0)?.[0]

  const confidence = Math.min(0.95, Math.max(0.4, neighbors.length / 20 + successRate * 0.3))

  const insight: SimilarityInsight = {
    similarWorkloadsFound: neighbors.length,
    averageCarbonSaved,
    recommendedRegion,
    confidence,
    neighbors,
  }

  logIntelligenceEvent('INTELLIGENCE_SIMILARITY_SEARCH', {
    orgId: payload.orgId,
    similarWorkloadsFound: neighbors.length,
    recommendedRegion,
    confidence,
  })

  await incrementSimilarityQueryCount()

  return { fingerprint, embedding, insight }
}

function avg(values: number[]): number {
  return values.length ? Number((values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(2)) : 0
}
