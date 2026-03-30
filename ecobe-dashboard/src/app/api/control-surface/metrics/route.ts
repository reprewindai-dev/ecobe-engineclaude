import { NextResponse } from 'next/server'

import { getDashboardTelemetrySnapshot } from '@/lib/observability/telemetry'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(getDashboardTelemetrySnapshot())
}
