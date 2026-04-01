const WINDOW_MS = 10 * 60 * 1000
const MAX_REQUESTS = 5

interface RateLimitEntry {
  count: number
  resetAt: number
}

const buckets = new Map<string, RateLimitEntry>()

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSec: number
}

export function takeRateLimitToken(key: string): RateLimitResult {
  const now = Date.now()
  const current = buckets.get(key)

  if (!current || current.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + WINDOW_MS,
    })

    return {
      allowed: true,
      remaining: MAX_REQUESTS - 1,
      retryAfterSec: Math.ceil(WINDOW_MS / 1000),
    }
  }

  if (current.count >= MAX_REQUESTS) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    }
  }

  current.count += 1
  buckets.set(key, current)

  return {
    allowed: true,
    remaining: MAX_REQUESTS - current.count,
    retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  }
}
