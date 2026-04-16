export function toRoutingCacheBucket(timestamp: Date | string) {
  const bucket = new Date(timestamp)
  if (Number.isNaN(bucket.getTime())) {
    throw new Error(`Invalid routing cache timestamp: ${String(timestamp)}`)
  }
  bucket.setSeconds(0, 0)
  return bucket
}

export function toRoutingCacheKey(timestamp: Date | string) {
  return toRoutingCacheBucket(timestamp).toISOString()
}
