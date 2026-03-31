import { NextRequest, NextResponse } from 'next/server'

import { buildDemoRoutingDecision, type DemoRouteRequest } from '@/lib/control-plane-demo'

export const dynamic = 'force-dynamic'

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT_MAX_REQUESTS = 5
const rateLimit = new Map<string, { count: number; resetAt: number }>()

function getClientKey(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || 'anonymous'
  }
  return 'anonymous'
}

function isRateLimited(key: string) {
  const now = Date.now()
  const current = rateLimit.get(key)

  if (!current || current.resetAt <= now) {
    rateLimit.set(key, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    })
    return false
  }

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return true
  }

  current.count += 1
  rateLimit.set(key, current)
  return false
}

export async function POST(request: NextRequest) {
  try {
    const key = getClientKey(request)
    if (isRateLimited(key)) {
      return NextResponse.json(
        {
          error: 'Demo rate limit reached. Please try again shortly.',
        },
        { status: 429 }
      )
    }

    const body = (await request.json()) as DemoRouteRequest
    const decision = await buildDemoRoutingDecision(body)
    return NextResponse.json(decision)
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to compute demo route',
      },
      { status: 500 }
    )
  }
}
