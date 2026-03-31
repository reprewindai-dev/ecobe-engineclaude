import { NextResponse } from 'next/server'

import { fetchEngineJson, hasInternalApiKey } from '@/lib/control-surface/engine'
import type { ReplayBundle } from '@/types/control-surface'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  context: { params: Promise<{ decisionFrameId: string }> }
) {
  try {
    if (!hasInternalApiKey()) {
      return NextResponse.json(
        { error: 'Internal replay is not configured for this environment' },
        { status: 503 }
      )
    }

    const { decisionFrameId } = await context.params
    const replay = await fetchEngineJson<ReplayBundle>(
      `/ci/decisions/${encodeURIComponent(decisionFrameId)}/replay`,
      undefined,
      { internal: true }
    )
    return NextResponse.json(replay)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Replay fetch failed' },
      { status: 500 }
    )
  }
}
