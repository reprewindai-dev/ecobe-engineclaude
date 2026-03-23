import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'ecobe-dashboard', timestamp: new Date().toISOString() })
}
