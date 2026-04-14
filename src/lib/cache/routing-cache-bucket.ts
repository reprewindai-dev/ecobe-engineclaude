export function toRoutingCacheBucket(timestamp: Date | string) {
  const bucket = new Date(timestamp)
  bucket.setSeconds(0, 0)
  return bucket
}

export function toRoutingCacheKey(timestamp: Date | string) {
  return toRoutingCacheBucket(timestamp).toISOString()
}
