import Stripe from 'stripe'
import { Organization, OrgPlanTier } from '@prisma/client'
import { Router } from 'express'
import { z } from 'zod'

import { env } from '../config/env'
import {
  BillingLane,
  BillingSegment,
  BillingInterval,
  getBillingLaneLabel,
  getBillingOffer,
  getBillingSegmentLabel,
  resolveStripePriceId,
} from '../lib/commerce/catalog'
import { prisma } from '../lib/db'
import { getContactMailConfig, getFounderAlertMailConfig, hasFounderAlertMailConfig, sendResendEmail } from '../lib/mail/resend'
import { provisionOrganization } from '../lib/organizations'

const router = Router()

const stripe = new Stripe(env.STRIPE_SECRET_KEY || 'sk_test_missing', {
  apiVersion: '2026-02-25.clover' as any,
})

const growthPlanCommandLimit = 50_000
const enterprisePlanCommandLimit = 1_000_000

const laneSchema = z.enum(['pilot', 'ci', 'control_surface', 'enterprise'])
const segmentSchema = z.enum(['small', 'mid', 'large'])

const checkoutSchema = z
  .object({
    lane: laneSchema,
    segment: segmentSchema.optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.lane === 'pilot' && value.segment) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['segment'],
        message: 'Pilot checkout does not use a segment.',
      })
    }

    if (value.lane !== 'pilot' && !value.segment) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['segment'],
        message: 'Segment is required for this lane.',
      })
    }
  })

const sessionStatusSchema = z.object({
  sessionId: z.string().min(1),
})

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function getPublicSiteUrl(req: any) {
  const configured = env.CO2ROUTER_PUBLIC_URL?.trim()
  if (configured) {
    return configured.replace(/\/$/, '')
  }

  const origin = normalizeOptionalText(req.header('origin'))
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
    return origin.replace(/\/$/, '')
  }

  return 'https://co2router.com'
}

function getOrganizationName(companyName: string | null, buyerName: string | null, selection: {
  lane: BillingLane
  segment: BillingSegment | null
}) {
  if (companyName) return companyName
  if (buyerName) return `${buyerName} ${getBillingLaneLabel(selection.lane)}`
  if (selection.segment) {
    return `${getBillingSegmentLabel(selection.segment)} ${getBillingLaneLabel(selection.lane)}`
  }
  return 'CO2 Router Customer'
}

function resolveCustomField(session: Stripe.Checkout.Session, key: string) {
  const field = session.custom_fields?.find((item) => item.key === key)
  if (!field) return null
  if (field.type === 'text') {
    return normalizeOptionalText(field.text?.value)
  }
  if (field.type === 'dropdown') {
    return normalizeOptionalText(field.dropdown?.value)
  }
  return null
}

function resolveSelectionFromMetadata(metadata: Record<string, string | undefined>) {
  const lane = laneSchema.parse(metadata.lane)
  const segment =
    lane === 'pilot'
      ? null
      : segmentSchema.parse(metadata.segment)

  return {
    lane,
    segment,
  }
}

function isCheckoutSessionPaid(session: Stripe.Checkout.Session) {
  return (
    session.status === 'complete' &&
    (session.payment_status === 'paid' || session.payment_status === 'no_payment_required')
  )
}

function buildOrganizationMetadata(
  current: unknown,
  input: {
    sessionId: string
    customerId: string | null
    subscriptionId: string | null
    lane: BillingLane
    segment: BillingSegment | null
    interval: BillingInterval
    priceLabel: string
    amountTotal: number | null
    currency: string | null
    accessExpiresAt: string | null
  }
) {
  const metadata = asRecord(current)

  return {
    ...metadata,
    billingProduct: input.lane,
    billingSegment: input.segment,
    billingInterval: input.interval,
    billingPriceLabel: input.priceLabel,
    stripeCustomerId: input.customerId,
    stripeSubscriptionId: input.subscriptionId,
    lastCheckoutSessionId: input.sessionId,
    lastBillingActivationAt: new Date().toISOString(),
    latestAmountTotal: input.amountTotal,
    latestCurrency: input.currency,
    accessExpiresAt: input.accessExpiresAt,
  }
}

async function recordCommerceEvent(data: {
  eventType: string
  success: boolean
  message?: Record<string, unknown>
  errorCode?: string
  statusCode?: number
  durationMs?: number
}) {
  await prisma.integrationEvent
    .create({
      data: {
        source: 'STRIPE_COMMERCE',
        eventType: data.eventType,
        success: data.success,
        message: data.message ? JSON.stringify(data.message) : null,
        errorCode: data.errorCode ?? null,
        statusCode: data.statusCode ?? null,
        durationMs: data.durationMs ?? null,
      },
    })
    .catch(() => undefined)
}

async function findOrganizationByBillingEmail(email: string) {
  return prisma.organization.findFirst({
    where: {
      billingEmail: email.trim().toLowerCase(),
    },
    orderBy: {
      createdAt: 'asc',
    },
  })
}

async function upsertOrganizationFromCheckout(input: {
  buyerEmail: string
  buyerName: string | null
  companyName: string | null
  lane: BillingLane
  segment: BillingSegment | null
  interval: BillingInterval
  sessionId: string
  customerId: string | null
  subscriptionId: string | null
  priceLabel: string
  amountTotal: number | null
  currency: string | null
}) {
  const buyerEmail = input.buyerEmail.trim().toLowerCase()
  const offer = getBillingOffer(input.lane, input.segment)
  if (!offer) {
    throw new Error('Billing offer not found for checkout activation.')
  }

  const featureFlags = {
    ciWedge: Boolean(offer.featureFlags.ciWedge),
    controlSurface: Boolean(offer.featureFlags.controlSurface),
    enterpriseRollout: Boolean(offer.featureFlags.enterpriseRollout),
    pilotShadowMode: Boolean(offer.featureFlags.pilotShadowMode),
  }

  const accessExpiresAt =
    input.interval === 'one_time_30d'
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      : null

  const existingOrg = await findOrganizationByBillingEmail(buyerEmail)

  if (!existingOrg) {
    const created = await provisionOrganization({
      name: getOrganizationName(input.companyName, input.buyerName, {
        lane: input.lane,
        segment: input.segment,
      }),
      planTier: offer.planTier,
      billingEmail: buyerEmail,
      monthlyCommandLimit:
        offer.planTier === OrgPlanTier.ENTERPRISE
          ? enterprisePlanCommandLimit
          : growthPlanCommandLimit,
      featureFlags,
    })

    return prisma.organization.update({
      where: { id: created.id },
      data: {
        metadata: buildOrganizationMetadata(created.metadata, {
          sessionId: input.sessionId,
          customerId: input.customerId,
          subscriptionId: input.subscriptionId,
          lane: input.lane,
          segment: input.segment,
          interval: input.interval,
          priceLabel: input.priceLabel,
          amountTotal: input.amountTotal,
          currency: input.currency,
          accessExpiresAt,
        }),
      },
    })
  }

  return prisma.organization.update({
    where: { id: existingOrg.id },
    data: {
      name: existingOrg.name || getOrganizationName(input.companyName, input.buyerName, {
        lane: input.lane,
        segment: input.segment,
      }),
      planTier: offer.planTier,
      status: 'ACTIVE',
      billingEmail: buyerEmail,
      monthlyCommandLimit:
        offer.planTier === OrgPlanTier.ENTERPRISE
          ? enterprisePlanCommandLimit
          : growthPlanCommandLimit,
      featureFlags: {
        ...asRecord(existingOrg.featureFlags),
        ...featureFlags,
      },
      metadata: buildOrganizationMetadata(existingOrg.metadata, {
        sessionId: input.sessionId,
        customerId: input.customerId,
        subscriptionId: input.subscriptionId,
        lane: input.lane,
        segment: input.segment,
        interval: input.interval,
        priceLabel: input.priceLabel,
        amountTotal: input.amountTotal,
        currency: input.currency,
        accessExpiresAt,
      }),
    },
  })
}

async function sendActivationEmails(input: {
  organization: Organization
  buyerEmail: string
  buyerName: string | null
  companyName: string | null
  lane: BillingLane
  segment: BillingSegment | null
  priceLabel: string
  interval: BillingInterval
}) {
  const orgMetadata = asRecord(input.organization.metadata)
  if (orgMetadata.lastActivationEmailSessionId === orgMetadata.lastCheckoutSessionId) {
    return
  }

  const contactConfig = getContactMailConfig()
  const alertConfig = hasFounderAlertMailConfig() ? getFounderAlertMailConfig() : null
  const organizationName = input.organization.name
  const publicSiteUrl = env.CO2ROUTER_PUBLIC_URL?.trim() || 'https://co2router.com'
  const engineUrl = env.ECOBE_ENGINE_URL?.trim() || 'https://ecobe-engineclaude-production.up.railway.app'

  const summaryLines = [
    `Organization: ${organizationName}`,
    `Billing lane: ${getBillingLaneLabel(input.lane)}`,
    `Segment: ${getBillingSegmentLabel(input.segment)}`,
    `Price: ${input.priceLabel}`,
    `Plan tier: ${input.organization.planTier}`,
    `API key: ${input.organization.apiKey}`,
    `Control Surface: ${publicSiteUrl}/console`,
    `Engine base: ${engineUrl}/api/v1`,
  ]

  const acknowledgement = await sendResendEmail({
    from: contactConfig.from,
    to: input.buyerEmail,
    subject: `CO2 Router activation - ${getBillingLaneLabel(input.lane)}`,
    text: [
      `Hi ${input.buyerName ?? input.companyName ?? 'there'},`,
      '',
      'Your CO2 Router purchase has been activated.',
      '',
      ...summaryLines,
      '',
      'Next step: open the Control Surface and confirm the first governed workflow or API caller.',
      'If you need help immediately, reply to this message.',
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;background:#020617;color:#e2e8f0;padding:24px">
        <h1 style="font-size:18px;margin:0 0 16px;color:#f8fafc">CO2 Router activation is live</h1>
        <p>Your purchase has been activated for <strong>${organizationName}</strong>.</p>
        <ul>
          ${summaryLines.map((line) => `<li>${line}</li>`).join('')}
        </ul>
        <p>Next step: open the Control Surface and confirm the first governed workflow or API caller.</p>
      </div>
    `,
  })

  if (alertConfig) {
    await sendResendEmail({
      from: alertConfig.from,
      to: alertConfig.inbox,
      subject: `[CO2 Router Purchase] ${getBillingLaneLabel(input.lane)} - ${organizationName}`,
      text: [
        `Buyer email: ${input.buyerEmail}`,
        `Organization: ${organizationName}`,
        `Lane: ${getBillingLaneLabel(input.lane)}`,
        `Segment: ${getBillingSegmentLabel(input.segment)}`,
        `Price: ${input.priceLabel}`,
        `Plan tier: ${input.organization.planTier}`,
      ].join('\n'),
    }).catch(() => undefined)
  }

  if (acknowledgement.success) {
    await prisma.organization.update({
      where: { id: input.organization.id },
      data: {
        metadata: {
          ...asRecord(input.organization.metadata),
          lastActivationEmailSessionId: asRecord(input.organization.metadata).lastCheckoutSessionId ?? null,
          lastActivationEmailSentAt: new Date().toISOString(),
        },
      },
    })
  }
}

async function activateCheckoutSession(input: {
  session: Stripe.Checkout.Session
  eventType: string
  eventId?: string | null
}) {
  const selection = resolveSelectionFromMetadata(input.session.metadata ?? {})
  const offer = getBillingOffer(selection.lane, selection.segment)

  if (!offer) {
    throw new Error('Checkout session referenced an unknown billing offer.')
  }

  const buyerEmail =
    normalizeOptionalText(input.session.customer_details?.email) ??
    normalizeOptionalText(input.session.customer_email)
  if (!buyerEmail) {
    throw new Error('Checkout session completed without a billing email.')
  }

  const organization = await upsertOrganizationFromCheckout({
    buyerEmail,
    buyerName: normalizeOptionalText(input.session.customer_details?.name),
    companyName: resolveCustomField(input.session, 'company_name'),
    lane: selection.lane,
    segment: selection.segment,
    interval: offer.interval,
    sessionId: input.session.id,
    customerId: typeof input.session.customer === 'string' ? input.session.customer : null,
    subscriptionId:
      typeof input.session.subscription === 'string' ? input.session.subscription : null,
    priceLabel: offer.priceLabel,
    amountTotal: input.session.amount_total ?? null,
    currency: normalizeOptionalText(input.session.currency),
  })

  await sendActivationEmails({
    organization,
    buyerEmail,
    buyerName: normalizeOptionalText(input.session.customer_details?.name),
    companyName: resolveCustomField(input.session, 'company_name'),
    lane: selection.lane,
    segment: selection.segment,
    priceLabel: offer.priceLabel,
    interval: offer.interval,
  })

  await recordCommerceEvent({
    eventType: input.eventType,
    success: true,
    message: {
      eventId: input.eventId ?? null,
      lane: selection.lane,
      segment: selection.segment,
      sessionId: input.session.id,
      orgId: organization.id,
      orgSlug: organization.slug,
    },
  })

  return {
    organization,
    selection,
    offer,
    buyerEmail,
  }
}

router.post('/commerce/checkout', async (req, res) => {
  const startedAt = Date.now()

  try {
    if (!env.STRIPE_SECRET_KEY) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'STRIPE_NOT_CONFIGURED',
          message: 'Stripe checkout is not configured.',
        },
      })
    }

    const payload = checkoutSchema.parse(req.body)
    const offer = getBillingOffer(payload.lane, payload.segment ?? null)
    if (!offer) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_OFFER',
          message: 'Unknown billing offer.',
        },
      })
    }

    const priceId = resolveStripePriceId(offer)
    if (!priceId) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'PRICE_NOT_CONFIGURED',
          message: `Stripe price is not configured for ${offer.offerKey}.`,
        },
      })
    }

    const publicSiteUrl = getPublicSiteUrl(req)
    const session = await stripe.checkout.sessions.create({
      mode: offer.checkoutMode,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${publicSiteUrl}/purchase/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${publicSiteUrl}/purchase/cancel?lane=${offer.lane}${offer.segment ? `&segment=${offer.segment}` : ''}`,
      billing_address_collection: 'auto',
      custom_fields: [
        {
          key: 'company_name',
          label: {
            type: 'custom',
            custom: 'Company name',
          },
          type: 'text',
          optional: false,
        },
      ],
      customer_creation: offer.checkoutMode === 'payment' ? 'always' : undefined,
      allow_promotion_codes: false,
      client_reference_id: offer.offerKey,
      metadata: {
        lane: offer.lane,
        segment: offer.segment ?? '',
        interval: offer.interval,
        offerKey: offer.offerKey,
      },
      subscription_data:
        offer.checkoutMode === 'subscription'
          ? {
              metadata: {
                lane: offer.lane,
                segment: offer.segment ?? '',
                interval: offer.interval,
                offerKey: offer.offerKey,
              },
            }
          : undefined,
      payment_intent_data:
        offer.checkoutMode === 'payment'
          ? {
              metadata: {
                lane: offer.lane,
                segment: offer.segment ?? '',
                interval: offer.interval,
                offerKey: offer.offerKey,
              },
            }
          : undefined,
    })

    await recordCommerceEvent({
      eventType: 'CHECKOUT_SESSION_CREATED',
      success: true,
      durationMs: Date.now() - startedAt,
      message: {
        lane: offer.lane,
        segment: offer.segment,
        sessionId: session.id,
        mode: offer.checkoutMode,
      },
    })

    return res.status(201).json({
      success: true,
      sessionId: session.id,
      url: session.url,
      lane: offer.lane,
      segment: offer.segment,
      interval: offer.interval,
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

    console.error('Commerce checkout error:', error)
    await recordCommerceEvent({
      eventType: 'CHECKOUT_SESSION_FAILED',
      success: false,
      durationMs: Date.now() - startedAt,
      errorCode: 'CHECKOUT_SESSION_FAILED',
      message: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    })

    return res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to create checkout session.',
      },
    })
  }
})

router.get('/commerce/session-status', async (req, res) => {
  try {
    if (!env.STRIPE_SECRET_KEY) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'STRIPE_NOT_CONFIGURED',
          message: 'Stripe checkout is not configured.',
        },
      })
    }

    const { sessionId } = sessionStatusSchema.parse(req.query)
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    const metadata = session.metadata ?? {}
    const selection = resolveSelectionFromMetadata(metadata)
    const offer = getBillingOffer(selection.lane, selection.segment)

    const buyerEmail =
      normalizeOptionalText(session.customer_details?.email) ??
      normalizeOptionalText(session.customer_email) ??
      null
    let organization = buyerEmail ? await findOrganizationByBillingEmail(buyerEmail) : null

    if (isCheckoutSessionPaid(session)) {
      const activation = await activateCheckoutSession({
        session,
        eventType: 'CHECKOUT_SESSION_FINALIZED_FROM_STATUS',
      })
      organization = activation.organization
    }

    const organizationMetadata = asRecord(organization?.metadata)

    return res.json({
      success: true,
      sessionId: session.id,
      lane: selection.lane,
      segment: selection.segment,
      interval: offer?.interval ?? metadata.interval ?? null,
      paymentStatus: session.payment_status,
      checkoutStatus: session.status,
      priceLabel: offer?.priceLabel ?? null,
      buyerEmail,
      buyerName: normalizeOptionalText(session.customer_details?.name),
      organization: organization
        ? {
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
            planTier: organization.planTier,
            activatedAt: organizationMetadata.lastBillingActivationAt ?? null,
            accessExpiresAt: organizationMetadata.accessExpiresAt ?? null,
          }
        : null,
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

    console.error('Commerce session-status error:', error)
    return res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to load checkout session status.',
      },
    })
  }
})

router.post('/commerce/webhook', async (req, res) => {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({
      success: false,
      error: {
        code: 'STRIPE_NOT_CONFIGURED',
        message: 'Stripe webhook is not configured.',
      },
    })
  }

  const signature = req.header('stripe-signature')
  const rawBody = typeof (req as any).rawBody === 'string' ? (req as any).rawBody : null

  if (!signature || !rawBody) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_WEBHOOK',
        message: 'Missing Stripe signature or raw body.',
      },
    })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET)
  } catch (error) {
    console.error('Stripe webhook signature verification failed:', error)
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_SIGNATURE',
        message: 'Stripe webhook signature verification failed.',
      },
    })
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      await activateCheckoutSession({
        session,
        eventType: 'CHECKOUT_SESSION_COMPLETED',
        eventId: event.id,
      })
    } else if (
      event.type === 'checkout.session.expired' ||
      event.type === 'checkout.session.async_payment_failed'
    ) {
      const session = event.data.object as Stripe.Checkout.Session
      await recordCommerceEvent({
        eventType: event.type.toUpperCase().replace(/\./g, '_'),
        success: false,
        message: {
          eventId: event.id,
          sessionId: session.id,
          paymentStatus: session.payment_status,
          status: session.status,
        },
      })
    }

    return res.json({ received: true })
  } catch (error) {
    console.error('Stripe webhook handling failed:', error)
    await recordCommerceEvent({
      eventType: 'WEBHOOK_PROCESSING_FAILED',
      success: false,
      errorCode: 'WEBHOOK_PROCESSING_FAILED',
      message: {
        eventId: event.id,
        eventType: event.type,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    })
    return res.status(500).json({
      success: false,
      error: {
        code: 'WEBHOOK_PROCESSING_FAILED',
        message: 'Failed to process Stripe webhook.',
      },
    })
  }
})

export default router
