import { Index } from '@upstash/vector'

import { resolveUpstashVectorConfig } from './upstash-config'

let vectorIndex: Index | null = null

const vectorConfig = resolveUpstashVectorConfig()

export const vectorNamespace = vectorConfig.indexName

export function getWorkloadVectorIndex(): Index | null {
  if (!vectorConfig.url || !vectorConfig.token) {
    return null
  }

  if (!vectorIndex) {
    vectorIndex = new Index({
      url: vectorConfig.url,
      token: vectorConfig.token,
    })
  }

  return vectorIndex
}
