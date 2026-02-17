import Redis from 'ioredis'
import { env } from '../config/env'

function normalizeRedisUrl(url: string): string {
  const trimmed = url.trim()

  // Common Railway/Upstash mistake: missing scheme, value starts with //...
  // ioredis treats this as a Unix socket path and crashes with ENOENT.
  if (trimmed.startsWith('//')) {
    return `rediss:${trimmed}`
  }

  // If no scheme is provided, default to TLS.
  if (!/^rediss?:\/\//i.test(trimmed)) {
    return `rediss://${trimmed.replace(/^\/+/, '')}`
  }

  return trimmed
}

export const redis = new Redis(normalizeRedisUrl(env.REDIS_URL), {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000)
    return delay
  },
})

redis.on('error', (err) => {
  console.error('Redis error:', err)
})

redis.on('connect', () => {
  console.log('✅ Redis connected')
})
