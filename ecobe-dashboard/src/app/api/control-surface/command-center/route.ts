import { NextResponse } from 'next/server'

import { getCommandCenterSnapshot } from '@/lib/control-surface/command-center'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const snapshot = await getCommandCenterSnapshot()
    return NextResponse.json(snapshot)
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to build command center snapshot',
      },
      { status: 500 }
    )
  }
}
