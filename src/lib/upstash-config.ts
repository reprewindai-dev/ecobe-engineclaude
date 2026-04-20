type QStashRegion = 'EU_CENTRAL_1' | 'US_EAST_1'

function readEnv(key: string) {
  const value = process.env[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function resolveRegion(regionValue?: string): QStashRegion | undefined {
  const normalized = regionValue?.trim().toUpperCase()
  if (normalized === 'EU_CENTRAL_1' || normalized === 'US_EAST_1') {
    return normalized
  }
  return undefined
}

function regionQStashConfig(region: QStashRegion | undefined) {
  if (region === 'EU_CENTRAL_1') {
    return {
      url: readEnv('EU_CENTRAL_1_QSTASH_URL'),
      token: readEnv('EU_CENTRAL_1_QSTASH_TOKEN'),
      currentSigningKey: readEnv('EU_CENTRAL_1_QSTASH_CURRENT_SIGNING_KEY'),
      nextSigningKey: readEnv('EU_CENTRAL_1_QSTASH_NEXT_SIGNING_KEY'),
    }
  }

  if (region === 'US_EAST_1') {
    return {
      url: readEnv('US_EAST_1_QSTASH_URL'),
      token: readEnv('US_EAST_1_QSTASH_TOKEN'),
      currentSigningKey: readEnv('US_EAST_1_QSTASH_CURRENT_SIGNING_KEY'),
      nextSigningKey: readEnv('US_EAST_1_QSTASH_NEXT_SIGNING_KEY'),
    }
  }

  return null
}

export function resolveQStashConfig() {
  const region = resolveRegion(readEnv('QSTASH_REGION'))
  const globalUrl = readEnv('QSTASH_URL') ?? readEnv('QSTASH_BASE_URL') ?? 'https://qstash.upstash.io'
  const globalToken = readEnv('QSTASH_TOKEN')
  const globalCurrentSigningKey = readEnv('QSTASH_CURRENT_SIGNING_KEY')
  const globalNextSigningKey = readEnv('QSTASH_NEXT_SIGNING_KEY')
  const regional = regionQStashConfig(region)

  return {
    region,
    baseUrl: regional?.url ?? globalUrl,
    token: regional?.token ?? globalToken,
    currentSigningKey: regional?.currentSigningKey ?? globalCurrentSigningKey,
    nextSigningKey: regional?.nextSigningKey ?? globalNextSigningKey,
  }
}

export function resolveUpstashVectorConfig() {
  return {
    url: readEnv('UPSTASH_VECTOR_REST_URL') ?? readEnv('UPSTASH_SEARCH_REST_URL'),
    token: readEnv('UPSTASH_VECTOR_REST_TOKEN') ?? readEnv('UPSTASH_SEARCH_REST_TOKEN'),
    indexName: readEnv('UPSTASH_VECTOR_INDEX_NAME') ?? readEnv('UPSTASH_SEARCH_INDEX_NAME'),
  }
}
