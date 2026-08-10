import { NextResponse } from 'next/server'

import { resolveHallOGridAccess } from '@/lib/control-surface/access'
import { getHallOGridWarmFrameDetail } from '@/lib/control-surface/hallogrid-mirror'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ decisionFrameId: string }> }
) {
  try {
    const access = resolveHallOGridAccess(request)

    if (!access.canViewOperatorConsole) {
      return NextResponse.json(
        {
          error: 'HallOGrid Pro is required for trace-backed frame detail.',
          code: 'HALLOGRID_PRO_REQUIRED',
          upgradeUrl: access.upgradeUrl,
          prompts: access.upgradePrompts,
        },
        { status: 403 }
      )
    }

    const { decisionFrameId } = await params
    const detail = await getHallOGridWarmFrameDetail(access, decisionFrameId)

    if (!detail) {
      return NextResponse.json({ error: 'Frame not found' }, { status: 404 })
    }

    return NextResponse.json(detail, {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to load frame detail',
      },
      { status: 500 }
    )
  }
}
