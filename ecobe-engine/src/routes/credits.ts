import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/db'
import { writeAuditLog } from '../lib/governance/audit'

const router = Router()

const orgIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/, 'organizationId must contain only alphanumeric characters, hyphens, or underscores')

const purchaseCreditSchema = z.object({
  organizationId: orgIdSchema.optional(),
  amountCO2: z.number().positive(),
  provider: z.string(),
  priceUsd: z.number().positive(),
  certificateUrl: z.string().url().optional(),
})

const retireCreditSchema = z.object({
  creditIds: z.array(z.string()).min(1),
  organizationId: orgIdSchema.optional(),
  reason: z.string().optional(),
  workloadRequestId: z.string().optional(),
})

// Purchase carbon credits
router.post('/purchase', async (req, res) => {
  try {
    const data = purchaseCreditSchema.parse(req.body)

    const credit = await prisma.carbonCredit.create({
      data: {
        organizationId: data.organizationId,
        amountCO2: data.amountCO2,
        provider: data.provider,
        priceUsd: data.priceUsd,
        certificateUrl: data.certificateUrl,
        status: 'ACTIVE',
        purchasedAt: new Date(),
      },
    })

    void writeAuditLog({
      organizationId: data.organizationId,
      actorType: 'API_KEY',
      action: 'CREDIT_PURCHASED',
      entityType: 'CarbonCredit',
      entityId: credit.id,
      payload: { amountCO2: data.amountCO2, provider: data.provider, priceUsd: data.priceUsd },
      result: 'SUCCESS',
    })

    res.json(credit)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    console.error('Purchase credit error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Retire carbon credits
router.post('/retire', async (req, res) => {
  try {
    const data = retireCreditSchema.parse(req.body)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await prisma.$transaction(async (tx: any) => {
      // 1. Read BEFORE writing — scope to org and active status only.
      //    This is the authoritative list of what we will retire.
      const creditsToRetire = await tx.carbonCredit.findMany({
        where: {
          id: { in: data.creditIds },
          status: 'ACTIVE',
          ...(data.organizationId ? { organizationId: data.organizationId } : {}),
        },
        select: { id: true, amountCO2: true },
      })

      if (creditsToRetire.length === 0) {
        throw Object.assign(new Error('No active credits found with provided IDs'), { statusCode: 404 })
      }

      const retirableIds = (creditsToRetire as Array<{ id: string; amountCO2: number }>).map((c) => c.id)
      const totalOffsetCO2 = (creditsToRetire as Array<{ id: string; amountCO2: number }>).reduce(
        (sum, c) => sum + c.amountCO2,
        0
      )

      // 2. Retire exactly the credits we just read — no phantom-read risk
      await tx.carbonCredit.updateMany({
        where: { id: { in: retirableIds }, status: 'ACTIVE' },
        data: { status: 'RETIRED', retiredAt: new Date() },
      })

      // 3. Log the offset using the sum we computed from the read — not from a post-write fetch
      await tx.emissionLog.create({
        data: {
          organizationId: data.organizationId,
          workloadRequestId: data.workloadRequestId,
          emissionCO2: -totalOffsetCO2,
          offsetCO2: totalOffsetCO2,
          region: 'OFFSET',
          source: 'CARBON_CREDIT',
          timestamp: new Date(),
        },
      })

      return { creditsRetired: creditsToRetire.length, totalOffsetCO2 }
    })

    void writeAuditLog({
      organizationId: data.organizationId,
      actorType: 'API_KEY',
      action: 'CREDIT_RETIRED',
      entityType: 'CarbonCredit',
      entityId: data.creditIds.join(','),
      payload: { creditIds: data.creditIds, totalOffsetCO2: result.totalOffsetCO2, creditsRetired: result.creditsRetired },
      result: 'SUCCESS',
      carbonSavedG: result.totalOffsetCO2,
    })

    res.json({
      success: true,
      creditsRetired: result.creditsRetired,
      totalOffsetCO2: result.totalOffsetCO2,
      message: 'Credits retired successfully',
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    if (error?.statusCode === 404) {
      return res.status(404).json({ error: error.message })
    }
    console.error('Retire credit error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// List carbon credits
router.get('/', async (req, res) => {
  try {
    const { organizationId, status, provider } = req.query

    // Validate organizationId format if provided
    if (organizationId !== undefined) {
      const parsed = orgIdSchema.safeParse(organizationId)
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid organizationId', details: parsed.error.errors })
      }
    }

    const where: Record<string, unknown> = {}

    if (organizationId) {
      where.organizationId = organizationId as string
    }

    if (status) {
      where.status = status as string
    }

    if (provider) {
      where.provider = provider as string
    }

    const credits = await (prisma as any).carbonCredit.findMany({
      where,
      orderBy: { purchasedAt: 'desc' },
      take: 100,
    })

    const creditList = credits as Array<{ status: string; amountCO2: number; priceUsd: number }>

    const totalActive = creditList
      .filter((c) => c.status === 'ACTIVE')
      .reduce<number>((sum, c) => sum + c.amountCO2, 0)

    const totalRetired = creditList
      .filter((c) => c.status === 'RETIRED')
      .reduce<number>((sum, c) => sum + c.amountCO2, 0)

    res.json({
      credits,
      summary: {
        totalCredits: creditList.length,
        totalActiveCO2: totalActive,
        totalRetiredCO2: totalRetired,
        totalPurchased: creditList.reduce<number>((sum, c) => sum + c.priceUsd, 0),
      },
    })
  } catch (error) {
    console.error('List credits error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get carbon balance for organization
router.get('/balance/:organizationId', async (req, res) => {
  try {
    const parsed = orgIdSchema.safeParse(req.params.organizationId)
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid organizationId', details: parsed.error.errors })
    }
    const { organizationId } = req.params

    // Get active credits
    const activeCredits = await prisma.carbonCredit.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
      },
    })

    const availableCO2 = activeCredits.reduce<number>((sum, c) => sum + c.amountCO2, 0)

    // Get total emissions
    const emissions = await prisma.emissionLog.findMany({
      where: { organizationId },
    })

    const totalEmissions = emissions
      .filter((e) => e.emissionCO2 > 0)
      .reduce<number>((sum, e) => sum + e.emissionCO2, 0)

    const totalOffset = emissions
      .filter((e) => e.offsetCO2 > 0)
      .reduce<number>((sum, e) => sum + e.offsetCO2, 0)

    const netEmissions = totalEmissions - totalOffset

    res.json({
      organizationId,
      availableCO2,
      totalEmissions,
      totalOffset,
      netEmissions,
      offsetPercentage: totalEmissions > 0 ? (totalOffset / totalEmissions) * 100 : 0,
      credits: {
        active: activeCredits.length,
        totalValue: activeCredits.reduce<number>((sum, c) => sum + c.priceUsd, 0),
      },
    })
  } catch (error) {
    console.error('Balance error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Auto-retire credits to offset emissions
router.post('/auto-offset', async (req, res) => {
  try {
    const bodySchema = z.object({
      organizationId: orgIdSchema,
      targetOffsetPercentage: z.number().min(0).max(100).default(100),
    })
    const { organizationId, targetOffsetPercentage } = bodySchema.parse(req.body)

    // All reads, calculations, and writes inside a single transaction to prevent
    // race conditions where concurrent requests could double-retire credits or
    // record an offset amount that doesn't match the credits actually retired.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await prisma.$transaction(async (tx: any) => {
      // Read phase — inside transaction for a consistent snapshot
      const emissions = await tx.emissionLog.findMany({
        where: { organizationId },
      })

      const totalEmissions = (emissions as any[])
        .filter((e) => e.emissionCO2 > 0)
        .reduce((sum: number, e) => sum + e.emissionCO2, 0)

      const totalOffset = (emissions as any[])
        .filter((e) => e.offsetCO2 > 0)
        .reduce((sum: number, e) => sum + e.offsetCO2, 0)

      const targetOffset = (totalEmissions * targetOffsetPercentage) / 100
      const neededOffset = targetOffset - totalOffset

      if (neededOffset <= 0) {
        return {
          alreadyMet: true,
          currentOffsetPercentage: totalEmissions > 0 ? (totalOffset / totalEmissions) * 100 : 0,
          totalEmissions,
          totalOffset,
        }
      }

      const activeCredits = await tx.carbonCredit.findMany({
        where: { organizationId, status: 'ACTIVE' },
        orderBy: { purchasedAt: 'asc' }, // FIFO
      })

      const availableCO2 = (activeCredits as any[]).reduce((sum: number, c) => sum + c.amountCO2, 0)

      if (availableCO2 < neededOffset) {
        return { insufficient: true, needed: neededOffset, available: availableCO2 }
      }

      // Select credits to retire
      let offsetAccumulated = 0
      const creditsToRetire: string[] = []

      for (const credit of activeCredits) {
        if (offsetAccumulated >= neededOffset) break
        creditsToRetire.push(credit.id)
        offsetAccumulated += (credit as any).amountCO2
      }

      // Retire and log — reads and writes are from the same transaction snapshot
      await tx.carbonCredit.updateMany({
        where: { id: { in: creditsToRetire }, status: 'ACTIVE' },
        data: { status: 'RETIRED', retiredAt: new Date() },
      })

      await tx.emissionLog.create({
        data: {
          organizationId,
          emissionCO2: -offsetAccumulated,
          offsetCO2: offsetAccumulated,
          region: 'OFFSET',
          source: 'AUTO_OFFSET',
          timestamp: new Date(),
        },
      })

      return { creditsToRetire, offsetAccumulated, totalEmissions, totalOffset }
    })

    if (result.alreadyMet) {
      return res.json({
        success: true,
        message: 'Already at or above target offset percentage',
        currentOffsetPercentage: result.currentOffsetPercentage,
      })
    }

    if (result.insufficient) {
      return res.status(400).json({
        error: 'Insufficient credits',
        needed: result.needed,
        available: result.available,
        shortfall: result.needed - result.available,
      })
    }

    const { creditsToRetire, offsetAccumulated, totalEmissions, totalOffset } = result as any

    void writeAuditLog({
      organizationId,
      actorType: 'API_KEY',
      action: 'CREDIT_AUTO_OFFSET',
      entityType: 'CarbonCredit',
      entityId: creditsToRetire.join(','),
      payload: { creditsRetired: creditsToRetire.length, totalOffsetCO2: offsetAccumulated, targetOffsetPercentage },
      result: 'SUCCESS',
      carbonSavedG: offsetAccumulated,
    })

    res.json({
      success: true,
      creditsRetired: creditsToRetire.length,
      totalOffsetCO2: offsetAccumulated,
      newOffsetPercentage: totalEmissions > 0 ? ((totalOffset + offsetAccumulated) / totalEmissions) * 100 : 0,
      message: 'Credits auto-retired successfully',
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    console.error('Auto-offset error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
