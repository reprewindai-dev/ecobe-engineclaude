import crypto from 'crypto'
import { startOfMonth } from 'date-fns'
import type { Organization, OrgUsageCounter, OrgPlanTier } from '@prisma/client'

import { prisma } from './db'

export type OrganizationErrorCode =
  | 'ORG_NOT_FOUND'
  | 'ORG_SUSPENDED'
  | 'QUOTA_EXCEEDED'
  | 'CREDIT_COVERAGE_REQUIRED'

export class OrganizationError extends Error {
  constructor(public code: OrganizationErrorCode, message: string) {
    super(message)
  }
}

export function usagePeriod(date: Date = new Date()): Date {
  return startOfMonth(date)
}

export async function requireActiveOrganization(orgId: string): Promise<Organization> {
  const org = await prisma.organization.findUnique({ where: { id: orgId } })
  if (!org) {
    throw new OrganizationError('ORG_NOT_FOUND', 'Organization not found for provided orgId.')
  }
  if (org.status !== 'ACTIVE') {
    throw new OrganizationError('ORG_SUSPENDED', 'Organization is not active.')
  }
  return org
}

export async function getOrCreateUsageCounter(orgId: string, periodStart: Date = usagePeriod()): Promise<OrgUsageCounter> {
  return prisma.orgUsageCounter.upsert({
    where: {
      orgId_periodStart: {
        orgId,
        periodStart,
      },
    },
    update: {},
    create: {
      orgId,
      periodStart,
    },
  })
}

export function assertCommandQuota(org: Organization, usage: OrgUsageCounter) {
  if (usage.commandCount >= org.monthlyCommandLimit) {
    throw new OrganizationError('QUOTA_EXCEEDED', 'Monthly command quota exceeded for this organization.')
  }
}

export async function incrementOrgUsage(
  orgId: string,
  periodStart: Date,
  delta: {
    commands?: number
    estimatedEmissionsKg?: number
    lastCommandAt?: Date
  }
) {
  await prisma.orgUsageCounter.upsert({
    where: {
      orgId_periodStart: {
        orgId,
        periodStart,
      },
    },
    update: {
      commandCount: delta.commands ? { increment: delta.commands } : undefined,
      estimatedEmissionsKg: delta.estimatedEmissionsKg ? { increment: delta.estimatedEmissionsKg } : undefined,
      lastCommandAt: delta.lastCommandAt ?? new Date(),
    },
    create: {
      orgId,
      periodStart,
      commandCount: delta.commands ?? 0,
      estimatedEmissionsKg: delta.estimatedEmissionsKg ?? 0,
      lastCommandAt: delta.lastCommandAt ?? new Date(),
    },
  })
}

export async function getAvailableCreditCoverage(orgId: string): Promise<number> {
  const credits = await prisma.carbonCredit.findMany({
    where: { organizationId: orgId, status: 'ACTIVE' },
    select: { amountCO2: true },
  })
  return credits.reduce((sum, credit) => sum + (credit.amountCO2 ?? 0), 0)
}

export async function ensureCreditCoverage(orgId: string, requiredAmount: number) {
  const available = await getAvailableCreditCoverage(orgId)
  if (available <= 0 || available < requiredAmount) {
    throw new OrganizationError('CREDIT_COVERAGE_REQUIRED', 'Insufficient carbon credits to cover this workload.')
  }
}

const API_KEY_PREFIX = 'eco_' as const

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50)

const generateApiKey = () => `${API_KEY_PREFIX}${crypto.randomBytes(24).toString('hex')}`

async function ensureUniqueSlug(desired: string) {
  let slug = desired
  let counter = 1
  while (await prisma.organization.findUnique({ where: { slug } })) {
    slug = `${desired}-${counter++}`
  }
  return slug
}

export async function provisionOrganization(input: {
  name: string
  slug?: string
  planTier?: OrgPlanTier
  billingEmail?: string
  enforceCreditCoverage?: boolean
  monthlyCommandLimit?: number
}): Promise<Organization> {
  const baseSlug = slugify(input.slug ?? input.name)
  const slug = await ensureUniqueSlug(baseSlug)
  const apiKey = generateApiKey()

  return prisma.organization.create({
    data: {
      name: input.name,
      slug,
      apiKey,
      billingEmail: input.billingEmail,
      planTier: input.planTier ?? 'FREE',
      enforceCreditCoverage: input.enforceCreditCoverage ?? false,
      monthlyCommandLimit: input.monthlyCommandLimit ?? 1000,
    },
  })
}

export async function rotateOrganizationApiKey(orgId: string): Promise<Organization> {
  const apiKey = generateApiKey()
  return prisma.organization.update({
    where: { id: orgId },
    data: { apiKey },
  })
}

export async function getOrganizationUsageSummary(orgId: string) {
  const currentPeriod = usagePeriod()
  const usage = await prisma.orgUsageCounter.findMany({
    where: { orgId },
    orderBy: { periodStart: 'desc' },
    take: 12,
  })

  const activeCredits = await prisma.carbonCredit.aggregate({
    _sum: { amountCO2: true },
    where: { organizationId: orgId, status: 'ACTIVE' },
  })

  return {
    currentPeriod,
    usage,
    availableCreditsKg: activeCredits._sum.amountCO2 ?? 0,
  }
}
