import { Index } from '@upstash/vector'

import { resolveUpstashVectorConfig } from '../../lib/upstash-config'

const workloadNamespace = 'workloads'

let workloadIndex: Index | null = null
let workloadNamespaceClient: ReturnType<Index['namespace']> | null = null

const vectorConfig = resolveUpstashVectorConfig()

function ensureWorkloadNamespace() {
  if (!vectorConfig.url || !vectorConfig.token) {
    return null
  }

  if (!workloadIndex) {
    workloadIndex = new Index({
      url: vectorConfig.url,
      token: vectorConfig.token,
    })
  }

  if (!workloadNamespaceClient) {
    workloadNamespaceClient = workloadIndex.namespace(workloadNamespace)
  }

  return workloadNamespaceClient
}

export interface WorkloadVectorMetadata extends Record<string, unknown> {
  workloadId: string
  orgId: string
  regionChosen?: string | null
  carbonIntensity?: number | null
  latency?: number | null
  cost?: number | null
  carbonSaved?: number | null
  success?: boolean | null
}

export async function storeWorkloadFingerprint(params: {
  workloadId: string
  embedding: number[]
  metadata: WorkloadVectorMetadata
}) {
  const namespace = ensureWorkloadNamespace()
  if (!namespace) return

  await namespace.upsert({
    id: params.workloadId,
    vector: params.embedding,
    metadata: params.metadata,
  })
}

export async function deleteWorkloadFingerprints(ids: string[]) {
  const namespace = ensureWorkloadNamespace()
  if (!namespace || ids.length === 0) return

  await namespace.delete(ids)
}

export async function findSimilarWorkloads(queryVector: number[], topK = 10) {
  const namespace = ensureWorkloadNamespace()
  if (!namespace) return []

  const matches = await namespace.query({
    topK,
    vector: queryVector,
    includeMetadata: true,
  })

  return matches.map((match) => ({
    metadata: (match.metadata ?? {}) as WorkloadVectorMetadata,
    score: match.score ?? 0,
  }))
}
