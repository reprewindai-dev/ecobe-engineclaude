import { NextResponse } from 'next/server'
import { getServerEngineBaseUrl } from '@/lib/server-engine-url'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const baseUrl = getServerEngineBaseUrl()
    const internalKey = process.env.ECOBE_INTERNAL_API_KEY

    const headers: Record<string, string> = {
      accept: 'application/json',
    }

    if (internalKey) {
      headers.authorization = `Bearer ${internalKey}`
      headers['x-ecobe-internal-key'] = internalKey
      headers['x-api-key'] = internalKey
    }

    const response = await fetch(`${baseUrl}/api/v1/dashboard/methodology/providers`, {
      headers,
      cache: 'no-store',
    })

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `Unable to load provider health (${response.status})`,
        },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to load provider health',
      },
      { status: 500 }
    )
  }
}
