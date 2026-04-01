import { prisma } from '../prisma'
import { redis } from '../redis'
import Stripe from 'stripe'
import { env } from '../../config/env'
import { OrgPlanTier, Organization } from '@prisma/client'
import { z } from 'zod'

type BillingPeriod = 'monthly' | 'annual'
type PricingSku =
  | 'ci_small'
  | 'ci_mid'
  | 'ci_large'
  | 'control_small'
  | 'control_mid'
  | 'control_large'
  | 'enterprise_small'
  | 'enterprise_mid'
  | 'enterprise_large'
  | 'pilot_30d'

// Initialize Stripe
const stripe = new Stripe(env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-12-18.acacia' as any,
})

const getStripeClient = (): Stripe => {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('Stripe secret key is not configured')
  }
  if (env.NODE_ENV === 'production' && env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
    throw new Error('Test Stripe key is not allowed in production')
  }
  return stripe
}

const SEGMENTED_PRICE_BOOK: Record<PricingSku, { monthly: number | null; annual: number | null; stripeMonthly?: string; stripeAnnual?: string }> = {
  ci_small: {
    monthly: 400,
    annual: null,
    stripeMonthly: env.STRIPE_SMALL_CI_MONTHLY_PRICE_ID,
  },
  ci_mid: {
    monthly: 800,
    annual: null,
    stripeMonthly: env.STRIPE_MID_CI_MONTHLY_PRICE_ID,
  },
  ci_large: {
    monthly: 1500,
    annual: null,
    stripeMonthly: env.STRIPE_LARGE_CI_MONTHLY_PRICE_ID,
  },
  control_small: {
    monthly: 2000,
    annual: null,
    stripeMonthly: env.STRIPE_SMALL_CONTROL_SURFACE_MONTHLY_PRICE_ID,
  },
  control_mid: {
    monthly: 4000,
    annual: null,
    stripeMonthly: env.STRIPE_MID_CONTROL_SURFACE_MONTHLY_PRICE_ID,
  },
  control_large: {
    monthly: 7000,
    annual: null,
    stripeMonthly: env.STRIPE_LARGE_CONTROL_SURFACE_MONTHLY_PRICE_ID,
  },
  enterprise_small: {
    monthly: null,
    annual: 60000,
    stripeAnnual: env.STRIPE_SMALL_ENTERPRISE_ANNUAL_PRICE_ID,
  },
  enterprise_mid: {
    monthly: null,
    annual: 120000,
    stripeAnnual: env.STRIPE_MID_ENTERPRISE_ANNUAL_PRICE_ID,
  },
  enterprise_large: {
    monthly: null,
    annual: 200000,
    stripeAnnual: env.STRIPE_LARGE_ENTERPRISE_ANNUAL_PRICE_ID,
  },
  pilot_30d: {
    monthly: 250,
    annual: null,
    stripeMonthly: env.STRIPE_PILOT_30D_PRICE_ID,
  },
}

const normalizePricingSku = (org: Organization): PricingSku => {
  const rawSku = ((org.metadata as any)?.pricingSku || '').toString().toLowerCase()
  const candidate = z.enum([
    'ci_small',
    'ci_mid',
    'ci_large',
    'control_small',
    'control_mid',
    'control_large',
    'enterprise_small',
    'enterprise_mid',
    'enterprise_large',
    'pilot_30d',
  ]).safeParse(rawSku)

  if (candidate.success) {
    return candidate.data
  }

  if (org.planTier === OrgPlanTier.ENTERPRISE) {
    return 'enterprise_small'
  }
  if (org.planTier === OrgPlanTier.GROWTH) {
    return 'ci_small'
  }
  return 'pilot_30d'
}

const resolvePriceId = (
  sku: PricingSku,
  period: BillingPeriod
): string | null => {
  const entry = SEGMENTED_PRICE_BOOK[sku]
  if (!entry) return null
  return period === 'monthly' ? entry.stripeMonthly || null : entry.stripeAnnual || null
}

const resolveBaseMonthlyPrice = (
  sku: PricingSku,
  period: BillingPeriod
): number => {
  const entry = SEGMENTED_PRICE_BOOK[sku]
  if (!entry) return 0
  if (period === 'monthly') return entry.monthly ?? 0
  if (entry.annual !== null) return entry.annual / 12
  return 0
}

// Pricing Configuration
export const PRICING = {
  FREE: {
    monthlyPrice: 0,
    annualPrice: 0,
    stripePriceId: null,
  },
  GROWTH: {
    monthlyPrice: 299,
    annualPrice: 2990, // ~17% discount
    stripePriceIdMonthly: env.STRIPE_GROWTH_MONTHLY_PRICE_ID,
    stripePriceIdAnnual: env.STRIPE_GROWTH_ANNUAL_PRICE_ID,
  },
  ENTERPRISE: {
    monthlyPrice: null, // Custom pricing
    annualPrice: null,
    stripePriceId: null,
  },
}

// Usage-based pricing
export const USAGE_PRICING = {
  carbonCommandOverage: 0.01, // per command over limit
  additionalRegion: 10, // per region per month
  dedicatedSupport: 500, // per month
  customModel: 100, // per model per month
}

export interface BillingMetrics {
  currentUsage: {
    commands: number
    regions: number
    customModels: number
  }
  limits: {
    commands: number
    regions: number
    customModels: number
  }
  overage: {
    commands: number
    amount: number
  }
  nextBillingDate: Date
  estimatedTotal: number
}

export interface Invoice {
  id: string
  orgId: string
  amount: number
  currency: string
  status: 'draft' | 'open' | 'paid' | 'void'
  lineItems: InvoiceLineItem[]
  dueDate: Date
  paidAt?: Date
  stripeInvoiceId?: string
}

export interface InvoiceLineItem {
  description: string
  quantity: number
  unitPrice: number
  amount: number
}

export class BillingService {
  /**
   * Create a Stripe customer for an organization
   */
  static async createStripeCustomer(org: Organization): Promise<string> {
    const customer = await getStripeClient().customers.create({
      email: org.billingEmail || undefined,
      name: org.name,
      metadata: {
        orgId: org.id,
        planTier: org.planTier,
      },
    })

    // Store the Stripe customer ID
    await prisma.organization.update({
      where: { id: org.id },
      data: { 
        metadata: {
          ...(org.metadata as any || {}),
          stripeCustomerId: customer.id,
        },
      },
    })

    return customer.id
  }

  /**
   * Create a subscription for an organization
   */
  static async createSubscription(
    orgId: string,
    planTier: OrgPlanTier,
    billingPeriod: BillingPeriod = 'monthly'
  ): Promise<Stripe.Subscription> {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
    })

    if (!org) {
      throw new Error('Organization not found')
    }

    // Get or create Stripe customer
    let customerId = (org.metadata as any)?.stripeCustomerId
    if (!customerId) {
      customerId = await this.createStripeCustomer(org)
    }

    const pricingSku = normalizePricingSku(org)

    // Get the appropriate price ID
    let priceId: string | null = resolvePriceId(pricingSku, billingPeriod)
    if (!priceId && planTier === OrgPlanTier.GROWTH) {
      // Legacy fallback for old env naming
      priceId =
        billingPeriod === 'monthly'
          ? env.STRIPE_GROWTH_MONTHLY_PRICE_ID || null
          : env.STRIPE_GROWTH_ANNUAL_PRICE_ID || null
    }
    if (!priceId && planTier === OrgPlanTier.ENTERPRISE) {
      priceId = env.STRIPE_ENTERPRISE_PRICE_ID || null
    }

    if (!priceId) {
      throw new Error(`Pricing is not configured for sku=${pricingSku} period=${billingPeriod}`)
    }

    // Create the subscription
    const subscription = await getStripeClient().subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      metadata: {
        orgId: org.id,
        planTier,
        pricingSku,
      },
      trial_period_days: 14, // 14-day trial
    })

    // Update organization
    await prisma.organization.update({
      where: { id: orgId },
      data: {
        planTier,
        metadata: {
          ...(org.metadata as any || {}),
          stripeSubscriptionId: subscription.id,
          billingPeriod,
          pricingSku,
        },
      },
    })

    return subscription
  }

  /**
   * Cancel a subscription
   */
  static async cancelSubscription(orgId: string): Promise<void> {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
    })

    if (!org) {
      throw new Error('Organization not found')
    }

    const subscriptionId = (org.metadata as any)?.stripeSubscriptionId
    if (!subscriptionId) {
      throw new Error('No active subscription found')
    }

    // Cancel at period end
    await getStripeClient().subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    })

    // Update organization
    await prisma.organization.update({
      where: { id: orgId },
      data: {
        metadata: {
          ...(org.metadata as any || {}),
          subscriptionCancelling: true,
        },
      },
    })
  }

  /**
   * Get billing metrics for an organization
   */
  static async getBillingMetrics(orgId: string): Promise<BillingMetrics> {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
    })

    if (!org) {
      throw new Error('Organization not found')
    }

    // Get current month's usage
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const usage = await prisma.orgUsageCounter.findUnique({
      where: {
        orgId_periodStart: {
          orgId,
          periodStart: startOfMonth,
        },
      },
    })

    const commandCount = usage?.commandCount || 0
    const commandLimit = org.monthlyCommandLimit

    // Calculate overage
    const overage = Math.max(0, commandCount - commandLimit)
    const overageAmount = overage * USAGE_PRICING.carbonCommandOverage

    // Get custom models count
    const customModels = await prisma.carbonCommand.findMany({
      where: {
        orgId,
        createdAt: { gte: startOfMonth },
        modelFamily: { notIn: ['gpt-4', 'claude', 'llama', 'mixtral'] },
      },
      distinct: ['modelFamily'],
    })

    // Calculate next billing date
    const nextBillingDate = new Date(startOfMonth)
    nextBillingDate.setMonth(nextBillingDate.getMonth() + 1)

    // Calculate estimated total
    let basePrice = 0
    if (org.planTier === OrgPlanTier.GROWTH) {
      const billingPeriod = ((org.metadata as any)?.billingPeriod || 'monthly') as BillingPeriod
      const pricingSku = normalizePricingSku(org)
      basePrice = resolveBaseMonthlyPrice(pricingSku, billingPeriod)
    }

    const estimatedTotal = basePrice + overageAmount + 
      (customModels.length * USAGE_PRICING.customModel)

    return {
      currentUsage: {
        commands: commandCount,
        regions: 0, // TODO: Implement region tracking
        customModels: customModels.length,
      },
      limits: {
        commands: commandLimit,
        regions: org.planTier === OrgPlanTier.ENTERPRISE ? -1 : 
          (org.planTier === OrgPlanTier.GROWTH ? 10 : 3),
        customModels: org.planTier === OrgPlanTier.FREE ? 0 : -1,
      },
      overage: {
        commands: overage,
        amount: overageAmount,
      },
      nextBillingDate,
      estimatedTotal,
    }
  }

  /**
   * Generate an invoice for usage
   */
  static async generateInvoice(orgId: string): Promise<Invoice> {
    const metrics = await this.getBillingMetrics(orgId)
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
    })

    if (!org) {
      throw new Error('Organization not found')
    }

    const lineItems: InvoiceLineItem[] = []

    // Base subscription
    if (org.planTier === OrgPlanTier.GROWTH) {
      const billingPeriod = ((org.metadata as any)?.billingPeriod || 'monthly') as BillingPeriod
      const pricingSku = normalizePricingSku(org)
      const basePrice = resolveBaseMonthlyPrice(pricingSku, billingPeriod)

      lineItems.push({
        description: `${org.planTier} Plan (${pricingSku}) - ${billingPeriod}`,
        quantity: 1,
        unitPrice: basePrice,
        amount: basePrice,
      })
    }

    // Overage charges
    if (metrics.overage.commands > 0) {
      lineItems.push({
        description: `Additional Carbon Commands (${metrics.overage.commands} commands)`,
        quantity: metrics.overage.commands,
        unitPrice: USAGE_PRICING.carbonCommandOverage,
        amount: metrics.overage.amount,
      })
    }

    // Custom models
    if (metrics.currentUsage.customModels > 0) {
      lineItems.push({
        description: `Custom Model Usage (${metrics.currentUsage.customModels} models)`,
        quantity: metrics.currentUsage.customModels,
        unitPrice: USAGE_PRICING.customModel,
        amount: metrics.currentUsage.customModels * USAGE_PRICING.customModel,
      })
    }

    const totalAmount = lineItems.reduce((sum, item) => sum + item.amount, 0)

    const invoice: Invoice = {
      id: `inv_${Date.now()}`,
      orgId,
      amount: totalAmount,
      currency: 'USD',
      status: 'draft',
      lineItems,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    }

    // Store invoice in database (you'd create an Invoice model)
    // await prisma.invoice.create({ data: invoice })

    return invoice
  }

  /**
   * Process a webhook from Stripe
   */
  static async processStripeWebhook(
    signature: string,
    rawBody: string
  ): Promise<void> {
    const webhookSecret = env.STRIPE_WEBHOOK_SECRET
    if (!webhookSecret) {
      throw new Error('Stripe webhook secret not configured')
    }

    let event: Stripe.Event

    try {
      event = getStripeClient().webhooks.constructEvent(rawBody, signature, webhookSecret)
    } catch (err) {
      throw new Error('Invalid webhook signature')
    }

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdate(event.data.object as Stripe.Subscription)
        break

      case 'customer.subscription.deleted':
        await this.handleSubscriptionCancellation(event.data.object as Stripe.Subscription)
        break

      case 'invoice.payment_succeeded':
        await this.handlePaymentSuccess(event.data.object as Stripe.Invoice)
        break

      case 'invoice.payment_failed':
        await this.handlePaymentFailure(event.data.object as Stripe.Invoice)
        break
    }
  }

  /**
   * Handle subscription updates
   */
  private static async handleSubscriptionUpdate(
    subscription: Stripe.Subscription
  ): Promise<void> {
    const orgId = subscription.metadata.orgId
    if (!orgId) return

    const planTier = subscription.metadata.planTier as OrgPlanTier

    await prisma.organization.update({
      where: { id: orgId },
      data: {
        planTier,
        metadata: {
          stripeSubscriptionId: subscription.id,
          subscriptionStatus: subscription.status,
          currentPeriodEnd: (subscription as any).current_period_end || null,
        },
      },
    })
  }

  /**
   * Handle subscription cancellation
   */
  private static async handleSubscriptionCancellation(
    subscription: Stripe.Subscription
  ): Promise<void> {
    const orgId = subscription.metadata.orgId
    if (!orgId) return

    await prisma.organization.update({
      where: { id: orgId },
      data: {
        planTier: OrgPlanTier.FREE,
        monthlyCommandLimit: 1000,
      },
    })
  }

  /**
   * Handle payment success
   */
  private static async handlePaymentSuccess(
    invoice: Stripe.Invoice
  ): Promise<void> {
    // Update organization billing status
    const customerId = invoice.customer as string
    const customer = await getStripeClient().customers.retrieve(customerId)
    
    if ('metadata' in customer && customer.metadata.orgId) {
      await prisma.organization.update({
        where: { id: customer.metadata.orgId },
        data: {
          metadata: {
            lastPaymentDate: new Date().toISOString(),
            paymentStatus: 'current',
          },
        },
      })
    }
  }

  /**
   * Handle payment failure
   */
  private static async handlePaymentFailure(
    invoice: Stripe.Invoice
  ): Promise<void> {
    const customerId = invoice.customer as string
    const customer = await getStripeClient().customers.retrieve(customerId)
    
    if ('metadata' in customer && customer.metadata.orgId) {
      await prisma.organization.update({
        where: { id: customer.metadata.orgId },
        data: {
          metadata: {
            paymentStatus: 'failed',
            lastPaymentFailure: new Date().toISOString(),
          },
        },
      })

      // TODO: Send payment failure notification
    }
  }
}
