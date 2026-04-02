import { createHash } from 'crypto'

import { Router } from 'express'
import { z } from 'zod'

import { prisma } from '../lib/db'
import { redis } from '../lib/redis'
import {
  getContactMailConfig,
  getFounderAlertMailConfig,
  getPublicReplyFromAddress,
  hasContactMailConfig,
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

type DeliveryStatus = 'delivered' | 'degraded' | 'failed_persist'

async function logContactEvent(input: {
  eventType: string
  success: boolean
  startedAt: number
  payload: z.infer<typeof contactSchema>
  extra?: Record<string, unknown>
  errorCode?: string
}) {
  await prisma.integrationEvent
    .create({
      data: {
        source: 'WEBSITE_CONTACT',
        eventType: input.eventType,
        success: input.success,
        durationMs: Date.now() - input.startedAt,
        errorCode: input.errorCode,
        message: JSON.stringify({
          category: input.payload.category,
          email: input.payload.email,
          company: normalizeOptionalText(input.payload.company),
          ...input.extra,
        }),
      },
    })
    .catch(() => undefined)
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
        deliveryStatus: 'delivered' satisfies DeliveryStatus,
      })
    }

    await logContactEvent({
      eventType: 'CONTACT_RECEIVED',
      success: true,
      startedAt,
      payload,
    })

    const body = buildContactMailBody(payload, req)
    const subject = `[CO2 Router Contact] ${getCategoryLabel(payload.category)} - ${payload.name}`
    const deliveryIssues: string[] = []
    let deliveryStatus: DeliveryStatus = 'degraded'
    let intakeMessageId: string | null = null

    if (hasContactMailConfig()) {
      try {
        const contactConfig = getContactMailConfig()
        const intakeResult = await sendResendEmail({
          from: contactConfig.from,
          to: contactConfig.inbox,
          subject,
          text: body.text,
          html: body.html,
          replyTo: payload.email,
        })

        if (intakeResult.success) {
          deliveryStatus = 'delivered'
          intakeMessageId = intakeResult.id ?? null
        } else {
          deliveryIssues.push(`intake_delivery_failed:${intakeResult.error ?? 'unknown'}`)
        }
      } catch (error) {
        deliveryIssues.push(
          `intake_delivery_failed:${error instanceof Error ? error.message : 'unknown'}`
        )
      }
    } else {
      deliveryIssues.push('mail_config_missing')
    }

    const acknowledgement = buildAcknowledgementBody(payload)
    if (deliveryStatus === 'delivered') {
      const acknowledgementResult = await sendResendEmail({
        from: getPublicReplyFromAddress(),
        to: payload.email,
        subject: 'CO2 Router received your message',
        text: acknowledgement.text,
        html: acknowledgement.html,
      }).catch((error) => ({
        success: false,
        error: error instanceof Error ? error.message : 'unknown',
      }))

      if (!acknowledgementResult.success) {
        deliveryIssues.push(
          `acknowledgement_failed:${acknowledgementResult.error ?? 'unknown'}`
        )
      }

      if (hasFounderAlertMailConfig() && payload.category !== 'support') {
        const founderAlert = getFounderAlertMailConfig()
        const founderResult = await sendResendEmail({
          from: founderAlert.from,
          to: founderAlert.inbox,
          subject: `[CO2 Router Priority Contact] ${getCategoryLabel(payload.category)} - ${payload.name}`,
          text: body.text,
          html: body.html,
          replyTo: payload.email,
        }).catch((error) => ({
          success: false,
          error: error instanceof Error ? error.message : 'unknown',
        }))

        if (!founderResult.success) {
          deliveryIssues.push(`founder_alert_failed:${founderResult.error ?? 'unknown'}`)
        }
      }
    }

    await logContactEvent({
      eventType: deliveryStatus === 'delivered' ? 'CONTACT_DELIVERED' : 'CONTACT_DELIVERY_DEGRADED',
      success: deliveryStatus === 'delivered',
      startedAt,
      payload,
      extra: {
        intakeMessageId,
        deliveryStatus,
        deliveryIssues,
      },
      errorCode: deliveryStatus === 'delivered' ? undefined : 'RESEND_DELIVERY_DEGRADED',
    })

    return res.json({
      success: true,
      message:
        deliveryStatus === 'delivered'
          ? 'Your message has been routed to the CO2 Router operating inbox.'
          : 'Your message has been recorded. Email delivery is temporarily degraded, but the operating team can recover this submission from the intake ledger.',
      remainingRequestsThisWindow: rateLimit.remaining,
      deliveryStatus,
      deliveryIssues: deliveryIssues.length > 0 ? deliveryIssues : undefined,
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
    if (!(error instanceof z.ZodError)) {
      await logContactEvent({
        eventType: 'CONTACT_PERSIST_FAILED',
        success: false,
        startedAt,
        payload: {
          category: (req.body?.category as z.infer<typeof categorySchema>) ?? 'sales',
          name: req.body?.name ?? 'unknown',
          email: req.body?.email ?? 'unknown@example.com',
          company: req.body?.company ?? null,
          message: req.body?.message ?? 'unavailable',
          executionFootprint: req.body?.executionFootprint ?? null,
          integrationSurface: req.body?.integrationSurface ?? null,
          website: req.body?.website ?? null,
        },
        extra: {
          error: error instanceof Error ? error.message : 'unknown',
        },
        errorCode: 'PERSIST_FAILED',
      })
    }
    return res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to submit contact request',
      },
      deliveryStatus: 'failed_persist' satisfies DeliveryStatus,
    })
  }
})

export default router
