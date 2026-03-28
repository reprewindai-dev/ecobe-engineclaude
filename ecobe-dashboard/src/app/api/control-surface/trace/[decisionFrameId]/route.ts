import { NextResponse } from 'next/server'

import { fetchEngineJson, hasInternalApiKey } from '@/lib/control-surface/engine'
import type { DecisionTraceRawRecord } from '@/types/control-surface'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  context: { params: Promise<{ decisionFrameId: string }> }
) {
  try {
    if (!hasInternalApiKey()) {
      return NextResponse.json(
        { error: 'Internal trace access is not configured for this environment' },
        { status: 503 }
      )
    }

    const { decisionFrameId } = await context.params
    const trace = await fetchEngineJson<DecisionTraceRawRecord>(
      `/ci/decisions/${encodeURIComponent(decisionFrameId)}/trace/raw`,
      undefined,
      { internal: true }
    )
    return NextResponse.json(trace)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Trace fetch failed' },
      { status: 500 }
    )
  }
}
