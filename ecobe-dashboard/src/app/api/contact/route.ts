import { NextRequest, NextResponse } from 'next/server'

import {
  getContactCategoryLabel,
  validateContactSubmission,
  type ContactSubmissionInput,
  type ContactSubmissionPayload,
} from '@/lib/contact'
import { getContactMailConfig, sendResendEmail } from '@/lib/mail/resend'
import { takeRateLimitToken } from '@/lib/server/rate-limit'

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    const [first] = forwardedFor.split(',')
    if (first?.trim()) return first.trim()
  }

  const realIp = request.headers.get('x-real-ip')
  if (realIp?.trim()) return realIp.trim()

  return 'unknown'
}

function normalizeHost(value: string) {
  const candidate = value.trim()
  if (!candidate) return null

  try {
    const url = candidate.includes('://') ? new URL(candidate) : new URL(`https://${candidate}`)
    const hostname = url.hostname.replace(/^www\./i, '').toLowerCase()
    const port = url.port && !['80', '443'].includes(url.port) ? `:${url.port}` : ''
    return `${hostname}${port}`
  } catch {
    return null
  }
}

function parseConfiguredAllowedOrigins() {
  return (process.env.CONTACT_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => normalizeHost(value))
    .filter((value): value is string => Boolean(value))
}

function getAllowedOriginHosts(request: NextRequest) {
  const allowedHosts = new Set<string>()

  for (const value of [
    request.nextUrl.host,
    request.headers.get('host'),
    request.headers.get('x-forwarded-host'),
  ]) {
    if (!value) continue
    for (const host of value.split(',').map((entry) => normalizeHost(entry))) {
      if (host) allowedHosts.add(host)
    }
  }

  for (const host of parseConfiguredAllowedOrigins()) {
    allowedHosts.add(host)
  }

  return allowedHosts
}

function isAllowedOrigin(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (!origin) return true

  const originHost = normalizeHost(origin)
  if (!originHost) return false

  return getAllowedOriginHosts(request).has(originHost)
}

function buildContactMessage(payload: ContactSubmissionPayload, request: NextRequest) {
  const submittedAt = new Date().toISOString()
  const origin = request.headers.get('origin') || 'unknown'
  const userAgent = request.headers.get('user-agent') || 'unknown'
  const clientIp = getClientIp(request)
  const categoryLabel = getContactCategoryLabel(payload.category)

  const lines = [
    `Category: ${categoryLabel}`,
    `Name: ${payload.name}`,
    `Email: ${payload.email}`,
    `Company: ${payload.company || 'Unavailable'}`,
    `Execution footprint: ${payload.executionFootprint || 'Unavailable'}`,
    `Integration surface: ${payload.integrationSurface || 'Unavailable'}`,
    `Submitted at: ${submittedAt}`,
    `Origin: ${origin}`,
    `Client IP: ${clientIp}`,
    `User-Agent: ${userAgent}`,
    '',
    'Message:',
    payload.message,
  ]

  return {
    text: lines.join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;background:#020617;color:#e2e8f0;padding:24px">
        <h1 style="font-size:18px;margin:0 0 16px;color:#f8fafc">CO2 Router Contact Submission</h1>
        <p><strong>Category:</strong> ${categoryLabel}</p>
        <p><strong>Name:</strong> ${payload.name}</p>
        <p><strong>Email:</strong> ${payload.email}</p>
        <p><strong>Company:</strong> ${payload.company || 'Unavailable'}</p>
        <p><strong>Execution footprint:</strong> ${payload.executionFootprint || 'Unavailable'}</p>
        <p><strong>Integration surface:</strong> ${payload.integrationSurface || 'Unavailable'}</p>
        <p><strong>Submitted at:</strong> ${submittedAt}</p>
        <p><strong>Origin:</strong> ${origin}</p>
        <p><strong>Client IP:</strong> ${clientIp}</p>
        <p><strong>User-Agent:</strong> ${userAgent}</p>
        <hr style="border-color:rgba(148,163,184,0.25);margin:20px 0" />
        <p style="white-space:pre-wrap;line-height:1.6">${payload.message}</p>
      </div>
    `,
  }
}

export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request)) {
    return NextResponse.json(
      {
        ok: false,
        message: 'Invalid origin.',
      },
      { status: 403 }
    )
  }

  const clientIp = getClientIp(request)
  const limiter = takeRateLimitToken(`contact:${clientIp}`)

  if (!limiter.allowed) {
    return NextResponse.json(
      {
        ok: false,
        message: 'Too many contact submissions. Try again shortly.',
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(limiter.retryAfterSec),
        },
      }
    )
  }

  let body: ContactSubmissionInput

  try {
    body = (await request.json()) as ContactSubmissionInput
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: 'Invalid request payload.',
      },
      { status: 400 }
    )
  }

  const validation = validateContactSubmission(body)

  if (validation.spam) {
    return NextResponse.json({
      ok: true,
      message: 'Your message has been delivered.',
    })
  }

  if (!validation.success || !validation.data) {
    return NextResponse.json(
      {
        ok: false,
        message: 'Contact submission failed validation.',
        errors: validation.errors,
      },
      { status: 400 }
    )
  }

  try {
    const contactConfig = getContactMailConfig()
    const message = buildContactMessage(validation.data, request)
    const subject = `[CO2 Router Contact] ${getContactCategoryLabel(validation.data.category)} - ${validation.data.name}`

    const result = await sendResendEmail({
      from: contactConfig.from,
      to: contactConfig.inbox,
      subject,
      text: message.text,
      html: message.html,
      replyTo: validation.data.email,
    })

    if (!result.success) {
      return NextResponse.json(
        {
          ok: false,
          message: 'Contact delivery failed. Try again shortly.',
        },
        { status: 502 }
      )
    }

    return NextResponse.json({
      ok: true,
      message: 'Your message has been routed to the CO2 Router operating inbox.',
    })
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: 'Contact delivery failed. Try again shortly.',
      },
      { status: 500 }
    )
  }
}
