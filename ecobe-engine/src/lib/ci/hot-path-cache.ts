import { toRoutingCacheBucket } from '../grid-signals/grid-signal-cache'

export function toDecisionRoutingCacheBucket(timestamp: Date | string) {
  return toRoutingCacheBucket(timestamp)
}
