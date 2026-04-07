import { NextResponse } from 'next/server'

import { resolveHallOGridAccess } from '@/lib/control-surface/access'
import {
  getHallOGridWarmFrameDetail,
  invalidateHallOGridMirror,
} from '@/lib/control-surface/hallogrid-mirror'
import {
  createHallOGridOverride,
  getHallOGridOverrides,
  updateHallOGridOverrideStatus,
} from '@/lib/control-surface/pro-governance-store'
import type { HallOGridOverrideRecord } from '@/types/control-surface'

export const dynamic = 'force-dynamic'

const VALID_OVERRIDE_ACTIONS = new Set([
  'approve_anyway',
  'force_reroute',
  'force_delay',
  'force_deny',
  'switch_to_advisory',
])

const VALID_OVERRIDE_STATUSES = new Set(['active', 'scheduled', 'expired'])

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

    const overrides = await getHallOGridOverrides(detail.frame)
    return NextResponse.json(overrides, {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load overrides' },
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
    if (!access.canAccessControls) {
      return NextResponse.json(
        {
          error: 'Operator access is required to create overrides.',
          code: 'HALLOGRID_OPERATOR_REQUIRED',
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
      requestedAction?: HallOGridOverrideRecord['requestedAction']
      reasonCode?: string
      scope?: string
      ticketRef?: string
      expiresInHours?: number | null
    }

    if (!body.requestedAction || !body.reasonCode?.trim() || !body.scope?.trim() || !body.ticketRef?.trim()) {
      return NextResponse.json(
        { error: 'requestedAction, reasonCode, scope, and ticketRef are required.' },
        { status: 400 }
      )
    }

    if (!VALID_OVERRIDE_ACTIONS.has(body.requestedAction)) {
      return NextResponse.json(
        { error: 'Invalid override action.' },
        { status: 400 }
      )
    }

    const overrides = await createHallOGridOverride(
      detail.frame,
      {
        requestedAction: body.requestedAction,
        reasonCode: body.reasonCode,
        scope: body.scope,
        ticketRef: body.ticketRef,
        expiresInHours: body.expiresInHours ?? null,
      },
      actorFromRequest(request, access.role)
    )
    invalidateHallOGridMirror(access, decisionFrameId)

    return NextResponse.json(overrides, {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create override' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ decisionFrameId: string }> }
) {
  try {
    const access = resolveHallOGridAccess(request)
    if (!access.canAccessControls) {
      return NextResponse.json(
        {
          error: 'Operator access is required to update overrides.',
          code: 'HALLOGRID_OPERATOR_REQUIRED',
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
      overrideId?: string
      status?: HallOGridOverrideRecord['status']
    }

    if (!body.overrideId || !body.status) {
      return NextResponse.json(
        { error: 'overrideId and status are required.' },
        { status: 400 }
      )
    }

    if (!VALID_OVERRIDE_STATUSES.has(body.status)) {
      return NextResponse.json(
        { error: 'Invalid override status.' },
        { status: 400 }
      )
    }

    const overrides = await updateHallOGridOverrideStatus(
      detail.frame,
      body.overrideId,
      body.status,
      actorFromRequest(request, access.role)
    )

    if (!overrides) {
      return NextResponse.json({ error: 'Override not found' }, { status: 404 })
    }
    invalidateHallOGridMirror(access, decisionFrameId)

    return NextResponse.json(overrides, {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update override' },
      { status: 500 }
    )
  }
}
