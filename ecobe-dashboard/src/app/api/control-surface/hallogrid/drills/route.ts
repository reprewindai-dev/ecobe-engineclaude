import { NextResponse } from 'next/server'

import { resolveHallOGridAccess } from '@/lib/control-surface/access'
import { simulateHallOGridDrill } from '@/lib/control-surface/pro-workspace'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const access = resolveHallOGridAccess(request)

    if (!access.canAccessControls) {
      return NextResponse.json(
        {
          error: 'Operator or governance access is required to run HallOGrid drills.',
          code: 'HALLOGRID_CONTROL_REQUIRED',
          upgradeUrl: access.upgradeUrl,
        },
        { status: 403 }
      )
    }

    const body = (await request.json()) as { frameId?: string; scenario?: string }

    if (!body.frameId || !body.scenario) {
      return NextResponse.json(
        { error: 'frameId and scenario are required.' },
        { status: 400 }
      )
    }

    const drill = await simulateHallOGridDrill(body.frameId, body.scenario)
    if (!drill) {
      return NextResponse.json({ error: 'Drill target not found' }, { status: 404 })
    }

    return NextResponse.json(drill)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to run drill' },
      { status: 500 }
    )
  }
}
