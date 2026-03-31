import { createHash } from 'crypto'

import {
  DesignPartnerOnboardingStage,
  DesignPartnerStatus,
  DesignPartnerType,
} from '@prisma/client'
import { Router } from 'express'
import { z } from 'zod'

import { env } from '../config/env'
import { prisma } from '../lib/db'
import { redis } from '../lib/redis'

const router = Router()

const designPartnerStatuses = [
  'applied',
  'qualified',
  'accepted',
  'onboarding',
  'active',
  'graduating',
  'converted',
  'declined',
  'churned',
] as const

const designPartnerOnboardingStages = [
  'fit_confirmed',
  'agreement_sent',
  'agreement_signed',
  'kickoff_scheduled',
  'technical_setup',
  'first_value',
  'active_pilot',
  'graduation_review',
  'converted_paid',
] as const

const designPartnerStatusSchema = z.enum(designPartnerStatuses)
const designPartnerOnboardingStageSchema = z.enum(designPartnerOnboardingStages)

const statusToPrisma: Record<(typeof designPartnerStatuses)[number], DesignPartnerStatus> = {
  applied: DesignPartnerStatus.APPLIED,
  qualified: DesignPartnerStatus.QUALIFIED,
  accepted: DesignPartnerStatus.ACCEPTED,
  onboarding: DesignPartnerStatus.ONBOARDING,
  active: DesignPartnerStatus.ACTIVE,
  graduating: DesignPartnerStatus.GRADUATING,
  converted: DesignPartnerStatus.CONVERTED,
  declined: DesignPartnerStatus.DECLINED,
  churned: DesignPartnerStatus.CHURNED,
}

const statusFromPrisma: Record<DesignPartnerStatus, (typeof designPartnerStatuses)[number]> = {
  [DesignPartnerStatus.APPLIED]: 'applied',
  [DesignPartnerStatus.QUALIFIED]: 'qualified',
  [DesignPartnerStatus.ACCEPTED]: 'accepted',
  [DesignPartnerStatus.ONBOARDING]: 'onboarding',
  [DesignPartnerStatus.ACTIVE]: 'active',
  [DesignPartnerStatus.GRADUATING]: 'graduating',
  [DesignPartnerStatus.CONVERTED]: 'converted',
  [DesignPartnerStatus.DECLINED]: 'declined',
  [DesignPartnerStatus.CHURNED]: 'churned',
}

const stageToPrisma: Record<
  (typeof designPartnerOnboardingStages)[number],
  DesignPartnerOnboardingStage
> = {
  fit_confirmed: DesignPartnerOnboardingStage.FIT_CONFIRMED,
  agreement_sent: DesignPartnerOnboardingStage.AGREEMENT_SENT,
  agreement_signed: DesignPartnerOnboardingStage.AGREEMENT_SIGNED,
  kickoff_scheduled: DesignPartnerOnboardingStage.KICKOFF_SCHEDULED,
  technical_setup: DesignPartnerOnboardingStage.TECHNICAL_SETUP,
  first_value: DesignPartnerOnboardingStage.FIRST_VALUE,
  active_pilot: DesignPartnerOnboardingStage.ACTIVE_PILOT,
  graduation_review: DesignPartnerOnboardingStage.GRADUATION_REVIEW,
  converted_paid: DesignPartnerOnboardingStage.CONVERTED_PAID,
}

const stageFromPrisma: Record<
  DesignPartnerOnboardingStage,
  (typeof designPartnerOnboardingStages)[number]
> = {
  [DesignPartnerOnboardingStage.FIT_CONFIRMED]: 'fit_confirmed',
  [DesignPartnerOnboardingStage.AGREEMENT_SENT]: 'agreement_sent',
  [DesignPartnerOnboardingStage.AGREEMENT_SIGNED]: 'agreement_signed',
  [DesignPartnerOnboardingStage.KICKOFF_SCHEDULED]: 'kickoff_scheduled',
  [DesignPartnerOnboardingStage.TECHNICAL_SETUP]: 'technical_setup',
  [DesignPartnerOnboardingStage.FIRST_VALUE]: 'first_value',
  [DesignPartnerOnboardingStage.ACTIVE_PILOT]: 'active_pilot',
  [DesignPartnerOnboardingStage.GRADUATION_REVIEW]: 'graduation_review',
  [DesignPartnerOnboardingStage.CONVERTED_PAID]: 'converted_paid',
}

const PUBLIC_INTAKE_LIMIT = 5
const PUBLIC_INTAKE_WINDOW_SECONDS = 60 * 60

const applySchema = z.object({
  companyName: z.string().trim().min(2).max(160),
  companyDomain: z.string().trim().max(200).optional().nullable(),
  teamName: z.string().trim().max(160).optional().nullable(),
  teamType: z.enum(['infra', 'platform', 'sre', 'data', 'other']),
  applicantName: z.string().trim().min(2).max(160),
  applicantEmail: z.string().trim().email().max(320),
  roleTitle: z.string().trim().min(2).max(160),
  mainWorkloadsPlatforms: z.string().trim().min(20).max(2500),
  goalsSummary: z.string().trim().min(20).max(2500),
  scopedWorkflow: z.string().trim().min(20).max(2500),
  internalChampion: z.string().trim().min(2).max(500),
  commercialApprover: z.string().trim().max(500).optional().nullable(),
  commitmentConfirmed: z.literal(true),
  anonymizedProofPermission: z.literal(true),
  website: z.string().trim().max(0).optional().or(z.literal('')),
})

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  status: designPartnerStatusSchema.optional(),
  onboardingStage: designPartnerOnboardingStageSchema.optional(),
})

const updateSchema = z
  .object({
    status: designPartnerStatusSchema.optional(),
    onboardingStage: designPartnerOnboardingStageSchema.nullish(),
    firstValueAt: z.string().datetime().nullish(),
    convertedToPaidAt: z.string().datetime().nullish(),
    totalPartnerSourcedArr: z.number().int().min(0).optional(),
    notes: z.string().trim().max(5000).nullish(),
  })
  .refine((payload) => Object.values(payload).some((value) => value !== undefined), {
    message: 'At least one field must be updated',
  })

function requireAdminAccess(req: any, res: any, next: any) {
  const providedHeader = req.header('x-ecobe-admin-token')
  const authorization = req.header('authorization')
  const providedBearer =
    authorization && authorization.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : undefined

  const validTokens = [env.UI_TOKEN, env.ECOBE_INTERNAL_API_KEY].filter(
    (value): value is string => Boolean(value)
  )

  if (validTokens.length === 0) {
    return next()
  }

  const token = providedHeader ?? providedBearer
  if (!token || !validTokens.includes(token)) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid admin token',
      },
    })
  }

  return next()
}

function normalizeOptionalText(value?: string | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function normalizeDomain(value?: string | null) {
  const trimmed = value?.trim().toLowerCase()
  if (!trimmed) return null

  try {
    const url = trimmed.includes('://') ? new URL(trimmed) : new URL(`https://${trimmed}`)
    return url.hostname.replace(/^www\./, '')
  } catch {
    return trimmed.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '') || null
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function buildCrmKey(companyName: string, companyDomain: string | null, applicantEmail: string) {
  const orgKey = companyDomain ?? slugify(companyName)
  return `${orgKey}::${applicantEmail.trim().toLowerCase()}`
}

function buildRateLimitKey(req: any) {
  const forwardedFor = req.header('x-forwarded-for')
  const ip =
    (typeof forwardedFor === 'string' && forwardedFor.split(',')[0]?.trim()) ||
    req.ip ||
    'unknown'

  return `design_partner_apply:${createHash('sha256').update(ip).digest('hex')}`
}

async function enforcePublicRateLimit(req: any) {
  const key = buildRateLimitKey(req)
  const current = await redis.incr(key).catch(() => null)

  if (current === 1) {
    await redis.expire(key, PUBLIC_INTAKE_WINDOW_SECONDS).catch(() => undefined)
  }

  if (typeof current !== 'number') {
    return {
      allowed: true,
      remaining: PUBLIC_INTAKE_LIMIT,
      retryAfterSeconds: PUBLIC_INTAKE_WINDOW_SECONDS,
    }
  }

  return {
    allowed: current <= PUBLIC_INTAKE_LIMIT,
    remaining: Math.max(0, PUBLIC_INTAKE_LIMIT - current),
    retryAfterSeconds: PUBLIC_INTAKE_WINDOW_SECONDS,
  }
}

function serializeDesignPartner(partner: {
  id: string
  companyName: string
  companyDomain: string | null
  teamName: string | null
  teamType: string | null
  applicantName: string
  applicantEmail: string
  roleTitle: string
  mainWorkloadsPlatforms: string
  goalsSummary: string
  scopedWorkflow: string
  internalChampion: string
  commercialApprover: string | null
  partnerType: DesignPartnerType
  cohort: string
  status: DesignPartnerStatus
  onboardingStage: DesignPartnerOnboardingStage | null
  firstValueAt: Date | null
  convertedToPaidAt: Date | null
  totalPartnerSourcedArr: number
  commitmentConfirmed: boolean
  anonymizedProofPermission: boolean
  notes: string | null
  metadata: unknown
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: partner.id,
    companyName: partner.companyName,
    companyDomain: partner.companyDomain,
    teamName: partner.teamName,
    teamType: partner.teamType,
    applicantName: partner.applicantName,
    applicantEmail: partner.applicantEmail,
    roleTitle: partner.roleTitle,
    mainWorkloadsPlatforms: partner.mainWorkloadsPlatforms,
    goalsSummary: partner.goalsSummary,
    scopedWorkflow: partner.scopedWorkflow,
    internalChampion: partner.internalChampion,
    commercialApprover: partner.commercialApprover,
    partnerType: partner.partnerType === DesignPartnerType.DESIGN ? 'design' : 'design',
    cohort: partner.cohort,
    status: statusFromPrisma[partner.status],
    onboardingStage: partner.onboardingStage
      ? stageFromPrisma[partner.onboardingStage]
      : null,
    firstValueAt: partner.firstValueAt?.toISOString() ?? null,
    convertedToPaidAt: partner.convertedToPaidAt?.toISOString() ?? null,
    totalPartnerSourcedArr: partner.totalPartnerSourcedArr,
    commitmentConfirmed: partner.commitmentConfirmed,
    anonymizedProofPermission: partner.anonymizedProofPermission,
    notes: partner.notes,
    metadata: partner.metadata,
    createdAt: partner.createdAt.toISOString(),
    updatedAt: partner.updatedAt.toISOString(),
  }
}

router.post('/design-partners/applications', async (req, res) => {
  try {
    const rateLimit = await enforcePublicRateLimit(req)
    if (!rateLimit.allowed) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many submissions from this source. Try again later.',
        },
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      })
    }

    const payload = applySchema.parse(req.body)
    const normalizedDomain = normalizeDomain(payload.companyDomain)
    const crmKey = buildCrmKey(
      payload.companyName,
      normalizedDomain,
      payload.applicantEmail
    )

    const existing = await prisma.designPartner.findUnique({
      where: { crmKey },
    })

    const existingMetadata =
      existing?.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
        ? existing.metadata
        : {}

    const baseData = {
      companyName: payload.companyName.trim(),
      companyDomain: normalizedDomain,
      teamName: normalizeOptionalText(payload.teamName),
      teamType: payload.teamType,
      applicantName: payload.applicantName.trim(),
      applicantEmail: payload.applicantEmail.trim().toLowerCase(),
      roleTitle: payload.roleTitle.trim(),
      mainWorkloadsPlatforms: payload.mainWorkloadsPlatforms.trim(),
      goalsSummary: payload.goalsSummary.trim(),
      scopedWorkflow: payload.scopedWorkflow.trim(),
      internalChampion: payload.internalChampion.trim(),
      commercialApprover: normalizeOptionalText(payload.commercialApprover),
      commitmentConfirmed: payload.commitmentConfirmed,
      anonymizedProofPermission: payload.anonymizedProofPermission,
      metadata: {
        ...existingMetadata,
        intakeSource: 'design-partners-page',
        lastSubmittedAt: new Date().toISOString(),
      },
    }

    const reopened =
      existing?.status === DesignPartnerStatus.DECLINED ||
      existing?.status === DesignPartnerStatus.CHURNED

    const partner = existing
      ? await prisma.designPartner.update({
          where: { crmKey },
          data: {
            ...baseData,
            ...(reopened
              ? {
                  status: DesignPartnerStatus.APPLIED,
                  onboardingStage: null,
                  firstValueAt: null,
                  convertedToPaidAt: null,
                  totalPartnerSourcedArr: 0,
                }
              : {}),
          },
        })
      : await prisma.designPartner.create({
          data: {
            crmKey,
            ...baseData,
            partnerType: DesignPartnerType.DESIGN,
            cohort: 'v1',
            status: DesignPartnerStatus.APPLIED,
          },
        })

    const partnerStatus = partner.status as DesignPartnerStatus

    await prisma.integrationEvent
      .create({
        data: {
          source: 'DESIGN_PARTNER_PROGRAM',
          eventType: existing ? 'APPLICATION_UPDATED' : 'APPLICATION_CREATED',
          success: true,
          message: JSON.stringify({
            partnerId: partner.id,
            companyName: partner.companyName,
            applicantEmail: partner.applicantEmail,
            status: statusFromPrisma[partnerStatus],
          }),
        },
      })
      .catch(() => undefined)

    return res.status(existing ? 200 : 201).json({
      success: true,
      partner: serializeDesignPartner(partner),
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

    console.error('Design partner application error:', error)
    return res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to record design partner application',
      },
    })
  }
})

router.get('/design-partners', requireAdminAccess, async (req, res) => {
  try {
    const { limit, status, onboardingStage } = listSchema.parse(req.query)

    const partners = await prisma.designPartner.findMany({
      where: {
        ...(status ? { status: statusToPrisma[status] } : {}),
        ...(onboardingStage
          ? { onboardingStage: stageToPrisma[onboardingStage] }
          : {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    })

    return res.json({
      success: true,
      defaults: {
        partner_type: 'design',
        cohort: 'v1',
      },
      statusOptions: designPartnerStatuses,
      onboardingStageOptions: designPartnerOnboardingStages,
      partners: partners.map(serializeDesignPartner),
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

    console.error('List design partners error:', error)
    return res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to list design partners',
      },
    })
  }
})

router.patch('/design-partners/:id', requireAdminAccess, async (req, res) => {
  try {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params)
    const payload = updateSchema.parse(req.body)

    const partner = await prisma.designPartner.update({
      where: { id },
      data: {
        ...(payload.status ? { status: statusToPrisma[payload.status] } : {}),
        ...(payload.onboardingStage !== undefined
          ? {
              onboardingStage: payload.onboardingStage
                ? stageToPrisma[payload.onboardingStage]
                : null,
            }
          : {}),
        ...(payload.firstValueAt !== undefined
          ? { firstValueAt: payload.firstValueAt ? new Date(payload.firstValueAt) : null }
          : {}),
        ...(payload.convertedToPaidAt !== undefined
          ? {
              convertedToPaidAt: payload.convertedToPaidAt
                ? new Date(payload.convertedToPaidAt)
                : null,
            }
          : {}),
        ...(payload.totalPartnerSourcedArr !== undefined
          ? { totalPartnerSourcedArr: payload.totalPartnerSourcedArr }
          : {}),
        ...(payload.notes !== undefined ? { notes: payload.notes ?? null } : {}),
      },
    })

    const partnerStatus = partner.status as DesignPartnerStatus
    const partnerOnboardingStage = partner.onboardingStage as DesignPartnerOnboardingStage | null

    await prisma.integrationEvent
      .create({
        data: {
          source: 'DESIGN_PARTNER_PROGRAM',
          eventType: 'PARTNER_UPDATED',
          success: true,
          message: JSON.stringify({
            partnerId: partner.id,
            status: statusFromPrisma[partnerStatus],
            onboardingStage: partnerOnboardingStage
              ? stageFromPrisma[partnerOnboardingStage]
              : null,
          }),
        },
      })
      .catch(() => undefined)

    return res.json({
      success: true,
      partner: serializeDesignPartner(partner),
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          details: error.errors,
        },
      })
    }

    if (error?.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Design partner record not found',
        },
      })
    }

    console.error('Update design partner error:', error)
    return res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to update design partner',
      },
    })
  }
})

export default router
