import { NextResponse } from 'next/server'

import { resolveHallOGridAccess } from '@/lib/control-surface/access'
import {
  getHallOGridWarmFrameDetail,
  invalidateHallOGridMirror,
} from '@/lib/control-surface/hallogrid-mirror'
import { getHallOGridDoctrine, updateHallOGridDoctrine } from '@/lib/control-surface/pro-governance-store'

export const dynamic = 'force-dynamic'

const VALID_AUTOMATION_MODES = new Set([
  'advisory_only',
  'supervised_automatic',
  'full_authority',
])

const VALID_FAIL_MODES = new Set([
  'fail_safe_deny',
  'fail_guarded_delay',
  'fail_open_last_safe_doctrine',
])

function actorFromRequest(request: Request, fallback: string) {
  return request.headers.get('x-hallogrid-actor')?.trim() || fallback
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ decisionFrameId: string }> }
) {
  try {
    const access = resolveHallOGridAccess(request)
    if (!access.canViewOperatorConsole) {
      return NextResponse.json({ error: 'HallOGrid Pro is required.' }, { status: 403 })
    }

    const { decisionFrameId } = await params
    const detail = await getHallOGridWarmFrameDetail(access, decisionFrameId)
    if (!detail) {
      return NextResponse.json({ error: 'Frame not found' }, { status: 404 })
    }

    const doctrine = await getHallOGridDoctrine(detail.frame)
    return NextResponse.json(doctrine, {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load doctrine' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ decisionFrameId: string }> }
) {
  try {
    const access = resolveHallOGridAccess(request)
    if (!access.canManageDoctrine) {
      return NextResponse.json(
        {
          error: 'Governance admin access is required to update doctrine.',
          code: 'HALLOGRID_DOCTRINE_ADMIN_REQUIRED',
        },
        { status: 403 }
      )
    }

    const { decisionFrameId } = await params
    const detail = await getHallOGridWarmFrameDetail(access, decisionFrameId)
    if (!detail) {
      return NextResponse.json({ error: 'Frame not found' }, { status: 404 })
    }

    const body = (await request.json()) as {
      automationMode?: 'advisory_only' | 'supervised_automatic' | 'full_authority'
      failMode?: 'fail_safe_deny' | 'fail_guarded_delay' | 'fail_open_last_safe_doctrine'
      activePolicyLabel?: string
    }

    if (!body.automationMode || !body.failMode || !body.activePolicyLabel?.trim()) {
      return NextResponse.json(
        { error: 'automationMode, failMode, and activePolicyLabel are required.' },
        { status: 400 }
      )
    }

    if (!VALID_AUTOMATION_MODES.has(body.automationMode) || !VALID_FAIL_MODES.has(body.failMode)) {
      return NextResponse.json(
        { error: 'Invalid doctrine mode or fail mode.' },
        { status: 400 }
      )
    }

    const doctrine = await updateHallOGridDoctrine(
      detail.frame,
      {
        automationMode: body.automationMode,
        failMode: body.failMode,
        activePolicyLabel: body.activePolicyLabel,
      },
      actorFromRequest(request, access.role)
    )
    invalidateHallOGridMirror(access, decisionFrameId)

    return NextResponse.json(doctrine, {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update doctrine' },
      { status: 500 }
    )
  }
}
