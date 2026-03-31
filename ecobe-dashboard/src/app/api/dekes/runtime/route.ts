import { NextRequest, NextResponse } from 'next/server'

import { buildDekesRuntimeReadModel, getDekesRuntimeHandoffById } from '@/lib/dekes-runtime'

export async function GET(request: NextRequest) {
  try {
    const view = request.nextUrl.searchParams.get('view') ?? 'all'
    const limit = Number(request.nextUrl.searchParams.get('limit') ?? '96')
    const handoffId = request.nextUrl.searchParams.get('handoffId')

    if (view === 'handoff') {
      if (!handoffId) {
        return NextResponse.json({ error: 'handoffId is required for handoff view' }, { status: 400 })
      }

      const handoff = await getDekesRuntimeHandoffById(handoffId)
      if (!handoff) {
        return NextResponse.json({ error: 'Handoff not found' }, { status: 404 })
      }

      return NextResponse.json(handoff)
    }

    const readModel = await buildDekesRuntimeReadModel(Number.isFinite(limit) ? limit : 96)

    if (view === 'summary') {
      return NextResponse.json(readModel.summary)
    }
    if (view === 'metrics') {
      return NextResponse.json(readModel.metrics)
    }
    if (view === 'events') {
      return NextResponse.json(readModel.events)
    }

    return NextResponse.json(readModel)
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Unable to build DEKES runtime read model',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 502 }
    )
  }
}
