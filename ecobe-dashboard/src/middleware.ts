import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

function isServerActionRequest(request: NextRequest) {
  return request.method === 'POST' && request.headers.has('next-action')
}

export function middleware(request: NextRequest) {
  if (!isServerActionRequest(request)) {
    return NextResponse.next()
  }

  return NextResponse.json(
    {
      error: 'stale_server_action_request',
      message: 'This deployment does not support Server Actions. Refresh the page and retry.',
    },
    {
      status: 409,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'x-ecobe-stale-action': '1',
      },
    }
  )
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
