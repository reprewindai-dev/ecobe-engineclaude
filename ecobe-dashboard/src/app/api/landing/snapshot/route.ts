import { NextResponse } from 'next/server'

import { getLandingSnapshot } from '@/lib/control-surface/landing-snapshot'
import { getCachedSnapshot } from '@/lib/control-surface/snapshot-cache'
import type { LandingSnapshot } from '@/types/control-surface'

export const dynamic = 'force-dynamic'

const LANDING_SNAPSHOT_CACHE_TTL_MS = 15_000
const LANDING_SNAPSHOT_CACHE_CONTROL = 'public, max-age=0, s-maxage=15, stale-while-revalidate=30'

export async function GET() {
  try {
    const { value: snapshot, cacheStatus } = await getCachedSnapshot<LandingSnapshot>(
      'landing-snapshot',
      LANDING_SNAPSHOT_CACHE_TTL_MS,
      getLandingSnapshot
    )

    const response = NextResponse.json(snapshot)
    response.headers.set('Cache-Control', LANDING_SNAPSHOT_CACHE_CONTROL)
    response.headers.set('x-co2router-snapshot-cache', cacheStatus)
    return response
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to build landing snapshot',
      },
      { status: 500 }
    )
  }
}
