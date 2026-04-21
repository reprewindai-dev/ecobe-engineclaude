import { resolveQStashConfig, resolveUpstashVectorConfig } from '../lib/upstash-config'

describe('upstash-config', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
    // Clear all upstash/qstash related env vars before each test
    const keysToDelete = [
      'QSTASH_REGION',
      'QSTASH_URL',
      'QSTASH_BASE_URL',
      'QSTASH_TOKEN',
      'QSTASH_CURRENT_SIGNING_KEY',
      'QSTASH_NEXT_SIGNING_KEY',
      'EU_CENTRAL_1_QSTASH_URL',
      'EU_CENTRAL_1_QSTASH_TOKEN',
      'EU_CENTRAL_1_QSTASH_CURRENT_SIGNING_KEY',
      'EU_CENTRAL_1_QSTASH_NEXT_SIGNING_KEY',
      'EU_EAST_1_QSTASH_URL',
      'EU_EAST_1_QSTASH_TOKEN',
      'EU_EAST_1_QSTASH_CURRENT_SIGNING_KEY',
      'EU_EAST_1_QSTASH_NEXT_SIGNING_KEY',
      'US_EAST_1_QSTASH_URL',
      'US_EAST_1_QSTASH_TOKEN',
      'US_EAST_1_QSTASH_CURRENT_SIGNING_KEY',
      'US_EAST_1_QSTASH_NEXT_SIGNING_KEY',
      'UPSTASH_VECTOR_REST_URL',
      'UPSTASH_VECTOR_REST_TOKEN',
      'UPSTASH_VECTOR_INDEX_NAME',
      'UPSTASH_SEARCH_REST_URL',
      'UPSTASH_SEARCH_REST_TOKEN',
      'UPSTASH_SEARCH_INDEX_NAME',
    ]
    for (const key of keysToDelete) {
      delete process.env[key]
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('resolveQStashConfig', () => {
    describe('no env vars set', () => {
      it('returns the default qstash.upstash.io URL', () => {
        const config = resolveQStashConfig()
        expect(config.baseUrl).toBe('https://qstash.upstash.io')
      })

      it('returns undefined region', () => {
        const config = resolveQStashConfig()
        expect(config.region).toBeUndefined()
      })

      it('returns undefined token', () => {
        const config = resolveQStashConfig()
        expect(config.token).toBeUndefined()
      })

      it('returns undefined signing keys', () => {
        const config = resolveQStashConfig()
        expect(config.currentSigningKey).toBeUndefined()
        expect(config.nextSigningKey).toBeUndefined()
      })
    })

    describe('global QSTASH_URL', () => {
      it('uses QSTASH_URL as baseUrl when set', () => {
        process.env.QSTASH_URL = 'https://qstash-us-east-1.upstash.io'
        const config = resolveQStashConfig()
        expect(config.baseUrl).toBe('https://qstash-us-east-1.upstash.io')
      })

      it('uses QSTASH_BASE_URL as baseUrl fallback when QSTASH_URL is absent', () => {
        process.env.QSTASH_BASE_URL = 'https://qstash-eu-central-1.upstash.io'
        const config = resolveQStashConfig()
        expect(config.baseUrl).toBe('https://qstash-eu-central-1.upstash.io')
      })

      it('prefers QSTASH_URL over QSTASH_BASE_URL', () => {
        process.env.QSTASH_URL = 'https://qstash-from-url.upstash.io'
        process.env.QSTASH_BASE_URL = 'https://qstash-from-base-url.upstash.io'
        const config = resolveQStashConfig()
        expect(config.baseUrl).toBe('https://qstash-from-url.upstash.io')
      })

      it('trims whitespace from env values', () => {
        process.env.QSTASH_URL = '  https://qstash-us-east-1.upstash.io  '
        const config = resolveQStashConfig()
        expect(config.baseUrl).toBe('https://qstash-us-east-1.upstash.io')
      })

      it('ignores empty string QSTASH_URL (falls back to QSTASH_BASE_URL)', () => {
        process.env.QSTASH_URL = ''
        process.env.QSTASH_BASE_URL = 'https://qstash-eu-central-1.upstash.io'
        const config = resolveQStashConfig()
        expect(config.baseUrl).toBe('https://qstash-eu-central-1.upstash.io')
      })

      it('ignores whitespace-only QSTASH_URL (falls back to default)', () => {
        process.env.QSTASH_URL = '   '
        const config = resolveQStashConfig()
        expect(config.baseUrl).toBe('https://qstash.upstash.io')
      })
    })

    describe('global token and signing keys', () => {
      it('includes QSTASH_TOKEN in result', () => {
        process.env.QSTASH_TOKEN = 'my-global-token'
        const config = resolveQStashConfig()
        expect(config.token).toBe('my-global-token')
      })

      it('includes QSTASH_CURRENT_SIGNING_KEY in result', () => {
        process.env.QSTASH_CURRENT_SIGNING_KEY = 'sig_current'
        const config = resolveQStashConfig()
        expect(config.currentSigningKey).toBe('sig_current')
      })

      it('includes QSTASH_NEXT_SIGNING_KEY in result', () => {
        process.env.QSTASH_NEXT_SIGNING_KEY = 'sig_next'
        const config = resolveQStashConfig()
        expect(config.nextSigningKey).toBe('sig_next')
      })
    })

    describe('EU_CENTRAL_1 region', () => {
      beforeEach(() => {
        process.env.QSTASH_REGION = 'EU_CENTRAL_1'
        process.env.EU_CENTRAL_1_QSTASH_URL = 'https://qstash-eu-central-1.upstash.io'
        process.env.EU_CENTRAL_1_QSTASH_TOKEN = 'eu-central-1-token'
        process.env.EU_CENTRAL_1_QSTASH_CURRENT_SIGNING_KEY = 'sig_eu_current'
        process.env.EU_CENTRAL_1_QSTASH_NEXT_SIGNING_KEY = 'sig_eu_next'
      })

      it('resolves region as EU_CENTRAL_1', () => {
        const config = resolveQStashConfig()
        expect(config.region).toBe('EU_CENTRAL_1')
      })

      it('uses EU_CENTRAL_1 URL as baseUrl', () => {
        const config = resolveQStashConfig()
        expect(config.baseUrl).toBe('https://qstash-eu-central-1.upstash.io')
      })

      it('uses EU_CENTRAL_1 token', () => {
        const config = resolveQStashConfig()
        expect(config.token).toBe('eu-central-1-token')
      })

      it('uses EU_CENTRAL_1 signing keys', () => {
        const config = resolveQStashConfig()
        expect(config.currentSigningKey).toBe('sig_eu_current')
        expect(config.nextSigningKey).toBe('sig_eu_next')
      })

      it('regional token overrides global QSTASH_TOKEN', () => {
        process.env.QSTASH_TOKEN = 'global-token'
        const config = resolveQStashConfig()
        expect(config.token).toBe('eu-central-1-token')
      })

      it('regional URL overrides global QSTASH_URL', () => {
        process.env.QSTASH_URL = 'https://global.qstash.io'
        const config = resolveQStashConfig()
        expect(config.baseUrl).toBe('https://qstash-eu-central-1.upstash.io')
      })

      it('falls back to global URL when regional URL is missing', () => {
        delete process.env.EU_CENTRAL_1_QSTASH_URL
        process.env.QSTASH_URL = 'https://global.qstash.io'
        const config = resolveQStashConfig()
        expect(config.baseUrl).toBe('https://global.qstash.io')
      })
    })

    describe('EU_EAST_1 region', () => {
      beforeEach(() => {
        process.env.QSTASH_REGION = 'EU_EAST_1'
        process.env.EU_EAST_1_QSTASH_URL = 'https://qstash-eu-east-1.upstash.io'
        process.env.EU_EAST_1_QSTASH_TOKEN = 'eu-east-1-token'
        process.env.EU_EAST_1_QSTASH_CURRENT_SIGNING_KEY = 'sig_eu_east_current'
        process.env.EU_EAST_1_QSTASH_NEXT_SIGNING_KEY = 'sig_eu_east_next'
      })

      it('resolves region as EU_EAST_1', () => {
        const config = resolveQStashConfig()
        expect(config.region).toBe('EU_EAST_1')
      })

      it('uses EU_EAST_1 URL as baseUrl', () => {
        const config = resolveQStashConfig()
        expect(config.baseUrl).toBe('https://qstash-eu-east-1.upstash.io')
      })

      it('uses EU_EAST_1 token', () => {
        const config = resolveQStashConfig()
        expect(config.token).toBe('eu-east-1-token')
      })

      it('uses EU_EAST_1 signing keys', () => {
        const config = resolveQStashConfig()
        expect(config.currentSigningKey).toBe('sig_eu_east_current')
        expect(config.nextSigningKey).toBe('sig_eu_east_next')
      })
    })

    describe('US_EAST_1 region', () => {
      beforeEach(() => {
        process.env.QSTASH_REGION = 'US_EAST_1'
        process.env.US_EAST_1_QSTASH_URL = 'https://qstash-us-east-1.upstash.io'
        process.env.US_EAST_1_QSTASH_TOKEN = 'us-east-1-token'
        process.env.US_EAST_1_QSTASH_CURRENT_SIGNING_KEY = 'sig_us_current'
        process.env.US_EAST_1_QSTASH_NEXT_SIGNING_KEY = 'sig_us_next'
      })

      it('resolves region as US_EAST_1', () => {
        const config = resolveQStashConfig()
        expect(config.region).toBe('US_EAST_1')
      })

      it('uses US_EAST_1 URL as baseUrl', () => {
        const config = resolveQStashConfig()
        expect(config.baseUrl).toBe('https://qstash-us-east-1.upstash.io')
      })

      it('uses US_EAST_1 token', () => {
        const config = resolveQStashConfig()
        expect(config.token).toBe('us-east-1-token')
      })
    })

    describe('region normalization', () => {
      it('normalizes lowercase region to uppercase EU_CENTRAL_1', () => {
        process.env.QSTASH_REGION = 'eu_central_1'
        process.env.EU_CENTRAL_1_QSTASH_TOKEN = 'eu-central-token'
        const config = resolveQStashConfig()
        expect(config.region).toBe('EU_CENTRAL_1')
        expect(config.token).toBe('eu-central-token')
      })

      it('normalizes mixed case region', () => {
        process.env.QSTASH_REGION = 'Us_East_1'
        process.env.US_EAST_1_QSTASH_TOKEN = 'us-east-token'
        const config = resolveQStashConfig()
        expect(config.region).toBe('US_EAST_1')
      })

      it('ignores unrecognized region string and returns undefined region', () => {
        process.env.QSTASH_REGION = 'AP_SOUTHEAST_1'
        const config = resolveQStashConfig()
        expect(config.region).toBeUndefined()
      })

      it('ignores empty QSTASH_REGION', () => {
        process.env.QSTASH_REGION = ''
        const config = resolveQStashConfig()
        expect(config.region).toBeUndefined()
      })
    })

    describe('regional fallback to global credentials', () => {
      it('uses global token when regional token is absent', () => {
        process.env.QSTASH_REGION = 'US_EAST_1'
        process.env.QSTASH_TOKEN = 'global-fallback-token'
        // No US_EAST_1_QSTASH_TOKEN set
        const config = resolveQStashConfig()
        expect(config.token).toBe('global-fallback-token')
      })

      it('uses global signing keys when regional signing keys are absent', () => {
        process.env.QSTASH_REGION = 'EU_CENTRAL_1'
        process.env.QSTASH_CURRENT_SIGNING_KEY = 'global_current'
        process.env.QSTASH_NEXT_SIGNING_KEY = 'global_next'
        const config = resolveQStashConfig()
        expect(config.currentSigningKey).toBe('global_current')
        expect(config.nextSigningKey).toBe('global_next')
      })
    })
  })

  describe('resolveUpstashVectorConfig', () => {
    describe('no env vars set', () => {
      it('returns undefined url', () => {
        const config = resolveUpstashVectorConfig()
        expect(config.url).toBeUndefined()
      })

      it('returns undefined token', () => {
        const config = resolveUpstashVectorConfig()
        expect(config.token).toBeUndefined()
      })

      it('returns undefined indexName', () => {
        const config = resolveUpstashVectorConfig()
        expect(config.indexName).toBeUndefined()
      })
    })

    describe('UPSTASH_VECTOR_REST_URL (primary url)', () => {
      it('uses UPSTASH_VECTOR_REST_URL when set', () => {
        process.env.UPSTASH_VECTOR_REST_URL = 'https://vector.upstash.io'
        const config = resolveUpstashVectorConfig()
        expect(config.url).toBe('https://vector.upstash.io')
      })

      it('trims whitespace from url', () => {
        process.env.UPSTASH_VECTOR_REST_URL = '  https://vector.upstash.io  '
        const config = resolveUpstashVectorConfig()
        expect(config.url).toBe('https://vector.upstash.io')
      })

      it('ignores empty UPSTASH_VECTOR_REST_URL and falls back to search URL', () => {
        process.env.UPSTASH_VECTOR_REST_URL = ''
        process.env.UPSTASH_SEARCH_REST_URL = 'https://search.upstash.io'
        const config = resolveUpstashVectorConfig()
        expect(config.url).toBe('https://search.upstash.io')
      })
    })

    describe('UPSTASH_SEARCH_REST_URL (alias/fallback)', () => {
      it('uses UPSTASH_SEARCH_REST_URL as url fallback', () => {
        process.env.UPSTASH_SEARCH_REST_URL = 'https://search.upstash.io'
        const config = resolveUpstashVectorConfig()
        expect(config.url).toBe('https://search.upstash.io')
      })

      it('prefers UPSTASH_VECTOR_REST_URL over UPSTASH_SEARCH_REST_URL', () => {
        process.env.UPSTASH_VECTOR_REST_URL = 'https://vector.upstash.io'
        process.env.UPSTASH_SEARCH_REST_URL = 'https://search.upstash.io'
        const config = resolveUpstashVectorConfig()
        expect(config.url).toBe('https://vector.upstash.io')
      })
    })

    describe('token resolution', () => {
      it('uses UPSTASH_VECTOR_REST_TOKEN when set', () => {
        process.env.UPSTASH_VECTOR_REST_TOKEN = 'vector-token-123'
        const config = resolveUpstashVectorConfig()
        expect(config.token).toBe('vector-token-123')
      })

      it('falls back to UPSTASH_SEARCH_REST_TOKEN', () => {
        process.env.UPSTASH_SEARCH_REST_TOKEN = 'search-token-456'
        const config = resolveUpstashVectorConfig()
        expect(config.token).toBe('search-token-456')
      })

      it('prefers UPSTASH_VECTOR_REST_TOKEN over UPSTASH_SEARCH_REST_TOKEN', () => {
        process.env.UPSTASH_VECTOR_REST_TOKEN = 'vector-token'
        process.env.UPSTASH_SEARCH_REST_TOKEN = 'search-token'
        const config = resolveUpstashVectorConfig()
        expect(config.token).toBe('vector-token')
      })

      it('ignores empty UPSTASH_VECTOR_REST_TOKEN and falls back to search token', () => {
        process.env.UPSTASH_VECTOR_REST_TOKEN = ''
        process.env.UPSTASH_SEARCH_REST_TOKEN = 'search-token'
        const config = resolveUpstashVectorConfig()
        expect(config.token).toBe('search-token')
      })
    })

    describe('indexName resolution', () => {
      it('uses UPSTASH_VECTOR_INDEX_NAME when set', () => {
        process.env.UPSTASH_VECTOR_INDEX_NAME = 'my-vector-index'
        const config = resolveUpstashVectorConfig()
        expect(config.indexName).toBe('my-vector-index')
      })

      it('falls back to UPSTASH_SEARCH_INDEX_NAME', () => {
        process.env.UPSTASH_SEARCH_INDEX_NAME = 'my-search-index'
        const config = resolveUpstashVectorConfig()
        expect(config.indexName).toBe('my-search-index')
      })

      it('prefers UPSTASH_VECTOR_INDEX_NAME over UPSTASH_SEARCH_INDEX_NAME', () => {
        process.env.UPSTASH_VECTOR_INDEX_NAME = 'vector-idx'
        process.env.UPSTASH_SEARCH_INDEX_NAME = 'search-idx'
        const config = resolveUpstashVectorConfig()
        expect(config.indexName).toBe('vector-idx')
      })

      it('ignores whitespace-only UPSTASH_VECTOR_INDEX_NAME and falls back', () => {
        process.env.UPSTASH_VECTOR_INDEX_NAME = '   '
        process.env.UPSTASH_SEARCH_INDEX_NAME = 'workloads'
        const config = resolveUpstashVectorConfig()
        expect(config.indexName).toBe('workloads')
      })
    })

    describe('complete configuration', () => {
      it('returns all three fields when all are set via primary vars', () => {
        process.env.UPSTASH_VECTOR_REST_URL = 'https://vector.upstash.io'
        process.env.UPSTASH_VECTOR_REST_TOKEN = 'vector-token'
        process.env.UPSTASH_VECTOR_INDEX_NAME = 'workloads'
        const config = resolveUpstashVectorConfig()
        expect(config).toEqual({
          url: 'https://vector.upstash.io',
          token: 'vector-token',
          indexName: 'workloads',
        })
      })

      it('returns all three fields when all are set via alias/search vars', () => {
        process.env.UPSTASH_SEARCH_REST_URL = 'https://search.upstash.io'
        process.env.UPSTASH_SEARCH_REST_TOKEN = 'search-token'
        process.env.UPSTASH_SEARCH_INDEX_NAME = 'workloads'
        const config = resolveUpstashVectorConfig()
        expect(config).toEqual({
          url: 'https://search.upstash.io',
          token: 'search-token',
          indexName: 'workloads',
        })
      })
    })
  })
})