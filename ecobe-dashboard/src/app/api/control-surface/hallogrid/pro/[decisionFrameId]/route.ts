import { NextResponse } from 'next/server'

import { resolveHallOGridAccess } from '@/lib/control-surface/access'
import { getHallOGridWarmWorkspace } from '@/lib/control-surface/hallogrid-mirror'

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
          error: 'HallOGrid Pro is required for operator workspace data.',
          code: 'HALLOGRID_PRO_REQUIRED',
          upgradeUrl: access.upgradeUrl,
          prompts: access.upgradePrompts,
        },
        { status: 403 }
      )
    }

    const { decisionFrameId } = await params
    const workspace = await getHallOGridWarmWorkspace(access, decisionFrameId)

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    return NextResponse.json(workspace, {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load Pro workspace' },
      { status: 500 }
    )
  }
}
