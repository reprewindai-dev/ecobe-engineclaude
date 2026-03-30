import { NextRequest, NextResponse } from 'next/server'

import { buildDemoRoutingDecision, type DemoRouteRequest } from '@/lib/control-plane-demo'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as DemoRouteRequest
    const decision = await buildDemoRoutingDecision(body)
    return NextResponse.json(decision)
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to compute routing decision',
      },
      { status: 500 }
    )
  }
}
