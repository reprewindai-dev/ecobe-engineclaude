/**
 * Budget management routes.
 *
 * Provides CRUD for per-organization CO2 budget periods.
 * Budgets gate routing decisions — when a budget is active, consumed CO2
 * is tracked atomically and callers are warned when nearing or exceeding limits.
 */

import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/db'
import { getBudgetStatus, BudgetPeriod } from '../lib/carbon-budget'

const router = Router()

const PERIOD_LENGTHS: Record<BudgetPeriod, number> = {
  monthly: 30,
  quarterly: 90,
  annual: 365,
}

function periodEnd(start: Date, period: BudgetPeriod): Date {
  const end = new Date(start)
  end.setDate(end.getDate() + PERIOD_LENGTHS[period])
  return end
}

// POST /api/v1/budgets — create or replace active budget for an org
router.post('/', async (req, res) => {
  const schema = z.object({
    organizationId: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/),
    budgetCO2Grams: z.number().positive(),
    budgetPeriod: z.enum(['monthly', 'quarterly', 'annual']).default('monthly'),
    periodStart: z.string().datetime().optional(),
    warningThresholdPct: z.number().min(0).max(1).default(0.8),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() })
  }

  const { organizationId, budgetCO2Grams, budgetPeriod, warningThresholdPct } = parsed.data
  const start = parsed.data.periodStart ? new Date(parsed.data.periodStart) : new Date()
  const end = periodEnd(start, budgetPeriod)

  try {
    // Deactivate any current active budget for this org
    const now = new Date()
    const existing = await (prisma as any).carbonBudget.findFirst({
      where: {
        organizationId,
        periodStart: { lte: now },
        periodEnd: { gte: now },
      },
    })

    if (existing) {
      // Close the existing budget period
      await (prisma as any).carbonBudget.update({
        where: { id: existing.id },
        data: { periodEnd: now },
      })
    }

    const budget = await (prisma as any).carbonBudget.create({
      data: {
        organizationId,
        budgetPeriod,
        periodStart: start,
        periodEnd: end,
        budgetCO2Grams,
        consumedCO2Grams: 0,
        warningThresholdPct,
      },
    })

    res.status(201).json(budget)
  } catch (err: any) {
    console.error('[budgets] create failed:', err?.message)
    res.status(500).json({ error: 'Failed to create budget' })
  }
})

// GET /api/v1/budgets/:organizationId — current active budget status
router.get('/:organizationId', async (req, res) => {
  const { organizationId } = req.params
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(organizationId)) {
    return res.status(400).json({ error: 'Invalid organizationId' })
  }

  try {
    const status = await getBudgetStatus(organizationId)
    if (!status) {
      return res.status(404).json({ message: 'No active budget period for this organization', organizationId })
    }
    res.json({ organizationId, ...status })
  } catch (err: any) {
    console.error('[budgets] read failed:', err?.message)
    res.status(500).json({ error: 'Failed to read budget' })
  }
})

// GET /api/v1/budgets/:organizationId/history — all budget periods
router.get('/:organizationId/history', async (req, res) => {
  const { organizationId } = req.params
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(organizationId)) {
    return res.status(400).json({ error: 'Invalid organizationId' })
  }

  try {
    const records = await (prisma as any).carbonBudget.findMany({
      where: { organizationId },
      orderBy: { periodStart: 'desc' },
      take: 24,
    })
    res.json({ organizationId, records })
  } catch (err: any) {
    console.error('[budgets] history failed:', err?.message)
    res.status(500).json({ error: 'Failed to read budget history' })
  }
})

export default router
