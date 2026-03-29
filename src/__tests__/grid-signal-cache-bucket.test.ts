jest.mock('../lib/redis', () => ({
  redis: {
    get: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
  },
}))

import { toRoutingCacheBucket, toRoutingCacheKey } from '../lib/grid-signals/grid-signal-cache'

describe('routing cache bucket helpers', () => {
  it('normalizes arbitrary timestamps to the minute bucket', () => {
    const timestamp = '2026-03-29T14:37:42.987Z'

    expect(toRoutingCacheBucket(timestamp).toISOString()).toBe('2026-03-29T14:37:00.000Z')
    expect(toRoutingCacheKey(timestamp)).toBe('2026-03-29T14:37:00.000Z')
  })

  it('returns the same cache key for read and warm timestamps inside the same minute', () => {
    const warmTimestamp = '2026-03-29T14:37:01.000Z'
    const requestTimestamp = '2026-03-29T14:37:58.000Z'

    expect(toRoutingCacheKey(warmTimestamp)).toBe(toRoutingCacheKey(requestTimestamp))
  })
})
