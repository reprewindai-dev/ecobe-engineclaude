import { NextResponse } from 'next/server'

import { getHallOGridFrameDetail } from '@/lib/control-surface/hallogrid'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ decisionFrameId: string }> }
) {
  try {
    const { decisionFrameId } = await params
    const detail = await getHallOGridFrameDetail(decisionFrameId)

    if (!detail) {
      return NextResponse.json({ error: 'Frame not found' }, { status: 404 })
    }

    return NextResponse.json(detail)
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to load frame detail',
      },
      { status: 500 }
    )
  }
}
