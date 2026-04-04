import { OrgPlanTier } from '@prisma/client'

import { env } from '../../config/env'

export type BillingLane = 'pilot' | 'ci' | 'control_surface' | 'enterprise'
export type BillingSegment = 'small' | 'mid' | 'large'
export type BillingInterval = 'one_time_30d' | 'monthly' | 'annual'

export interface BillingOffer {
  offerKey: string
  lane: BillingLane
  segment: BillingSegment | null
  priceLabel: string
  amountUsd: number
  interval: BillingInterval
  checkoutMode: 'payment' | 'subscription'
  planTier: OrgPlanTier
  priceEnvVar: string
  featureFlags: Record<string, boolean>
}

const OFFER_CATALOG: BillingOffer[] = [
  {
    offerKey: 'pilot_30d',
    lane: 'pilot',
    segment: null,
    priceLabel: '$250 / 30 days',
    amountUsd: 250,
    interval: 'one_time_30d',
    checkoutMode: 'payment',
    planTier: OrgPlanTier.GROWTH,
    priceEnvVar: 'STRIPE_PILOT_30D_PRICE_ID',
    featureFlags: {
      ciWedge: true,
      pilotShadowMode: true,
    },
  },
  {
    offerKey: 'small_ci',
    lane: 'ci',
    segment: 'small',
    priceLabel: '$400/mo',
    amountUsd: 400,
    interval: 'monthly',
    checkoutMode: 'subscription',
    planTier: OrgPlanTier.GROWTH,
    priceEnvVar: 'STRIPE_SMALL_CI_PRICE_ID',
    featureFlags: {
      ciWedge: true,
    },
  },
  {
    offerKey: 'small_control_surface',
    lane: 'control_surface',
    segment: 'small',
    priceLabel: '$2,000/mo',
    amountUsd: 2000,
    interval: 'monthly',
    checkoutMode: 'subscription',
    planTier: OrgPlanTier.GROWTH,
    priceEnvVar: 'STRIPE_SMALL_CONTROL_SURFACE_PRICE_ID',
    featureFlags: {
      ciWedge: true,
      controlSurface: true,
    },
  },
  {
    offerKey: 'small_enterprise',
    lane: 'enterprise',
    segment: 'small',
    priceLabel: '$60,000/yr',
    amountUsd: 60000,
    interval: 'annual',
    checkoutMode: 'subscription',
    planTier: OrgPlanTier.ENTERPRISE,
    priceEnvVar: 'STRIPE_SMALL_ENTERPRISE_PRICE_ID',
    featureFlags: {
      ciWedge: true,
      controlSurface: true,
      enterpriseRollout: true,
    },
  },
  {
    offerKey: 'mid_ci',
    lane: 'ci',
    segment: 'mid',
    priceLabel: '$800/mo',
    amountUsd: 800,
    interval: 'monthly',
    checkoutMode: 'subscription',
    planTier: OrgPlanTier.GROWTH,
    priceEnvVar: 'STRIPE_MID_CI_PRICE_ID',
    featureFlags: {
      ciWedge: true,
    },
  },
  {
    offerKey: 'mid_control_surface',
    lane: 'control_surface',
    segment: 'mid',
    priceLabel: '$4,000/mo',
    amountUsd: 4000,
    interval: 'monthly',
    checkoutMode: 'subscription',
    planTier: OrgPlanTier.GROWTH,
    priceEnvVar: 'STRIPE_MID_CONTROL_SURFACE_PRICE_ID',
    featureFlags: {
      ciWedge: true,
      controlSurface: true,
    },
  },
  {
    offerKey: 'mid_enterprise',
    lane: 'enterprise',
    segment: 'mid',
    priceLabel: '$120,000/yr',
    amountUsd: 120000,
    interval: 'annual',
    checkoutMode: 'subscription',
    planTier: OrgPlanTier.ENTERPRISE,
    priceEnvVar: 'STRIPE_MID_ENTERPRISE_PRICE_ID',
    featureFlags: {
      ciWedge: true,
      controlSurface: true,
      enterpriseRollout: true,
    },
  },
  {
    offerKey: 'large_ci',
    lane: 'ci',
    segment: 'large',
    priceLabel: '$1,500/mo',
    amountUsd: 1500,
    interval: 'monthly',
    checkoutMode: 'subscription',
    planTier: OrgPlanTier.GROWTH,
    priceEnvVar: 'STRIPE_LARGE_CI_PRICE_ID',
    featureFlags: {
      ciWedge: true,
    },
  },
  {
    offerKey: 'large_control_surface',
    lane: 'control_surface',
    segment: 'large',
    priceLabel: '$7,000/mo',
    amountUsd: 7000,
    interval: 'monthly',
    checkoutMode: 'subscription',
    planTier: OrgPlanTier.GROWTH,
    priceEnvVar: 'STRIPE_LARGE_CONTROL_SURFACE_PRICE_ID',
    featureFlags: {
      ciWedge: true,
      controlSurface: true,
    },
  },
  {
    offerKey: 'large_enterprise',
    lane: 'enterprise',
    segment: 'large',
    priceLabel: '$200,000/yr',
    amountUsd: 200000,
    interval: 'annual',
    checkoutMode: 'subscription',
    planTier: OrgPlanTier.ENTERPRISE,
    priceEnvVar: 'STRIPE_LARGE_ENTERPRISE_PRICE_ID',
    featureFlags: {
      ciWedge: true,
      controlSurface: true,
      enterpriseRollout: true,
    },
  },
]

export function getBillingOffer(lane: BillingLane, segment?: BillingSegment | null) {
  return (
    OFFER_CATALOG.find((offer) =>
      offer.lane === 'pilot' ? lane === 'pilot' : offer.lane === lane && offer.segment === segment
    ) ?? null
  )
}

export function listBillingOffers() {
  return OFFER_CATALOG.slice()
}

export function resolveStripePriceId(offer: BillingOffer) {
  const key = offer.priceEnvVar as keyof typeof env
  const value = env[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

export function getBillingLaneLabel(lane: BillingLane) {
  switch (lane) {
    case 'pilot':
      return 'Pilot / Shadow Mode'
    case 'ci':
      return 'CI'
    case 'control_surface':
      return 'Control Surface'
    case 'enterprise':
      return 'Enterprise'
  }
}

export function getBillingSegmentLabel(segment: BillingSegment | null) {
  if (segment === null) return 'Pilot'
  if (segment === 'small') return 'Small'
  if (segment === 'mid') return 'Mid'
  return 'Large'
}
