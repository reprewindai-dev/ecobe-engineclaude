import { createHash } from 'crypto'

import { Router } from 'express'
import { z } from 'zod'

import { prisma } from '../lib/db'
import { redis } from '../lib/redis'
import {
  getContactMailConfig,
  getFounderAlertMailConfig,
  hasFounderAlertMailConfig,
  sendResendEmail,
} from '../lib/mail/resend'

const router = Router()

const CONTACT_LIMIT = 5
const CONTACT_WINDOW_SECONDS = 60 * 10

const categorySchema = z.enum(['sales', 'support', 'security'])

const contactSchema = z.object({
  category: categorySchema,
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  company: z.string().trim().max(160).optional().nullable(),
  message: z.string().trim().min(20).max(5000),
  executionFootprint: z.string().trim().max(300).optional().nullable(),
  integrationSurface: z.string().trim().max(300).optional().nullable(),
  website: z.string().trim().max(500).optional().nullable(),
})

function normalizeOptionalText(value?: string | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function getClientIp(req: any) {
  const forwardedFor = req.header('x-forwarded-for')
  const candidate =
    (typeof forwardedFor === 'string' && forwardedFor.split(',')[0]?.trim()) ||
    req.ip ||
    'unknown'

  return candidate
}

async function enforceContactRateLimit(req: any) {
  const key = `contact_submit:${createHash('sha256').update(getClientIp(req)).digest('hex')}`
  const current = await redis.incr(key).catch(() => null)

  if (current === 1) {
    await redis.expire(key, CONTACT_WINDOW_SECONDS).catch(() => undefined)
  }

  if (typeof current !== 'number') {
    return {
      allowed: true,
      remaining: CONTACT_LIMIT,
      retryAfterSeconds: CONTACT_WINDOW_SECONDS,
    }
  }

  return {
    allowed: current <= CONTACT_LIMIT,
    remaining: Math.max(0, CONTACT_LIMIT - current),
    retryAfterSeconds: CONTACT_WINDOW_SECONDS,
  }
}

function getCategoryLabel(category: z.infer<typeof categorySchema>) {
  if (category === 'sales') return 'Sales'
  if (category === 'support') return 'Support'
  return 'Security'
}

function buildContactMailBody(
  payload: z.infer<typeof contactSchema>,
  req: any
) {
  const submittedAt = new Date().toISOString()
  const origin = req.header('origin') || req.header('referer') || 'unknown'
  const userAgent = req.header('user-agent') || 'unknown'
  const clientIp = getClientIp(req)

  const lines = [
    `Category: ${getCategoryLabel(payload.category)}`,
    `Name: ${payload.name}`,
    `Email: ${payload.email}`,
    `Company: ${normalizeOptionalText(payload.company) ?? 'Unavailable'}`,
    `Execution footprint: ${normalizeOptionalText(payload.executionFootprint) ?? 'Unavailable'}`,
    `Integration surface: ${normalizeOptionalText(payload.integrationSurface) ?? 'Unavailable'}`,
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
        <p><strong>Category:</strong> ${getCategoryLabel(payload.category)}</p>
        <p><strong>Name:</strong> ${payload.name}</p>
        <p><strong>Email:</strong> ${payload.email}</p>
        <p><strong>Company:</strong> ${normalizeOptionalText(payload.company) ?? 'Unavailable'}</p>
        <p><strong>Execution footprint:</strong> ${normalizeOptionalText(payload.executionFootprint) ?? 'Unavailable'}</p>
        <p><strong>Integration surface:</strong> ${normalizeOptionalText(payload.integrationSurface) ?? 'Unavailable'}</p>
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

function buildAcknowledgementBody(payload: z.infer<typeof contactSchema>) {
  return {
    text: [
      `Hi ${payload.name},`,
      '',
      'We received your CO2 Router message and routed it to the operating inbox.',
      'A human operator will follow up using this email thread.',
      '',
      `Category: ${getCategoryLabel(payload.category)}`,
      `Company: ${normalizeOptionalText(payload.company) ?? 'Unavailable'}`,
      '',
      'CO2 Router',
      'Deterministic environmental execution control plane',
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;background:#020617;color:#e2e8f0;padding:24px">
        <h1 style="font-size:18px;margin:0 0 16px;color:#f8fafc">We received your CO2 Router message</h1>
        <p>Hi ${payload.name},</p>
        <p>Your message has been routed to the CO2 Router operating inbox. A human operator will follow up using this thread.</p>
        <p><strong>Category:</strong> ${getCategoryLabel(payload.category)}</p>
        <p><strong>Company:</strong> ${normalizeOptionalText(payload.company) ?? 'Unavailable'}</p>
      </div>
    `,
  }
}

router.post('/contact', async (req, res) => {
  const startedAt = Date.now()

  try {
    const rateLimit = await enforceContactRateLimit(req)
    if (!rateLimit.allowed) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many contact submissions from this source. Try again later.',
        },
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      })
    }

    const payload = contactSchema.parse(req.body)

    if (payload.website?.trim()) {
      return res.json({
        success: true,
        message: 'Your message has been routed to the CO2 Router operating inbox.',
      })
    }

    const contactConfig = getContactMailConfig()
    const body = buildContactMailBody(payload, req)
    const subject = `[CO2 Router Contact] ${getCategoryLabel(payload.category)} - ${payload.name}`

    const intakeResult = await sendResendEmail({
      from: contactConfig.from,
      to: contactConfig.inbox,
      subject,
      text: body.text,
      html: body.html,
      replyTo: payload.email,
    })

    if (!intakeResult.success) {
      await prisma.integrationEvent
        .create({
          data: {
            source: 'WEBSITE_CONTACT',
            eventType: 'CONTACT_DELIVERY_FAILED',
            success: false,
            durationMs: Date.now() - startedAt,
            errorCode: 'RESEND_DELIVERY_FAILED',
            message: JSON.stringify({
              category: payload.category,
              email: payload.email,
              error: intakeResult.error,
            }),
          },
        })
        .catch(() => undefined)

      return res.status(502).json({
        success: false,
        error: {
          code: 'DELIVERY_FAILED',
          message: 'Contact delivery failed. Try again shortly.',
        },
      })
    }

    const acknowledgement = buildAcknowledgementBody(payload)
    const followUpJobs: Array<Promise<unknown>> = [
      sendResendEmail({
        from: contactConfig.from,
        to: payload.email,
        subject: 'CO2 Router received your message',
        text: acknowledgement.text,
        html: acknowledgement.html,
      }),
    ]

    if (hasFounderAlertMailConfig() && payload.category !== 'support') {
      const founderAlert = getFounderAlertMailConfig()
      followUpJobs.push(
        sendResendEmail({
          from: founderAlert.from,
          to: founderAlert.inbox,
          subject: `[CO2 Router Priority Contact] ${getCategoryLabel(payload.category)} - ${payload.name}`,
          text: body.text,
          html: body.html,
          replyTo: payload.email,
        })
      )
    }

    const followUpResults = await Promise.allSettled(followUpJobs)

    await prisma.integrationEvent
      .create({
        data: {
          source: 'WEBSITE_CONTACT',
          eventType: 'CONTACT_DELIVERED',
          success: true,
          durationMs: Date.now() - startedAt,
          message: JSON.stringify({
            category: payload.category,
            email: payload.email,
            intakeMessageId: intakeResult.id,
            acknowledgementDelivered:
              followUpResults[0]?.status === 'fulfilled' &&
              (followUpResults[0].value as { success?: boolean }).success === true,
            founderEscalated:
              followUpResults.length > 1 &&
              followUpResults[1]?.status === 'fulfilled' &&
              (followUpResults[1].value as { success?: boolean }).success === true,
          }),
        },
      })
      .catch(() => undefined)

    return res.json({
      success: true,
      message: 'Your message has been routed to the CO2 Router operating inbox.',
      remainingRequestsThisWindow: rateLimit.remaining,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          details: error.errors,
        },
      })
    }

    console.error('Contact submission error:', error)
    return res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to submit contact request',
      },
    })
  }
})

export default router
