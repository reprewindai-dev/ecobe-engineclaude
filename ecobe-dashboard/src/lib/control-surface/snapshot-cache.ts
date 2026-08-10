import 'server-only'

type CacheStatus = 'hit' | 'miss' | 'refresh'

type CacheEntry<T> = {
  value?: T
  expiresAt: number
  inflight?: Promise<T>
}

const snapshotCache = new Map<string, CacheEntry<unknown>>()

export function invalidateCachedSnapshot(key: string) {
  snapshotCache.delete(key)
}

export function invalidateCachedSnapshotPrefix(prefix: string) {
  for (const key of Array.from(snapshotCache.keys())) {
    if (key.startsWith(prefix)) {
      snapshotCache.delete(key)
    }
  }
}

export async function getCachedSnapshot<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<{ value: T; cacheStatus: CacheStatus }> {
  const now = Date.now()
  const current = snapshotCache.get(key) as CacheEntry<T> | undefined

  if (current?.value !== undefined && current.expiresAt > now) {
    return {
      value: current.value,
      cacheStatus: 'hit',
    }
  }

  if (current?.inflight) {
    return {
      value: await current.inflight,
      cacheStatus: current.value !== undefined ? 'refresh' : 'miss',
    }
  }

  const inflight = loader()
  snapshotCache.set(key, {
    value: current?.value,
    expiresAt: current?.expiresAt ?? 0,
    inflight,
  })

  try {
    const value = await inflight
    snapshotCache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    })
    return {
      value,
      cacheStatus: current?.value !== undefined ? 'refresh' : 'miss',
    }
  } catch (error) {
    if (current?.value !== undefined) {
      snapshotCache.set(key, {
        value: current.value,
        expiresAt: Date.now() + Math.max(1000, Math.floor(ttlMs / 4)),
      })
      return {
        value: current.value,
        cacheStatus: 'refresh',
      }
    }

    snapshotCache.delete(key)
    throw error
  }
}
