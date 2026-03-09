/**
 * CarbonBudget — per-organization CO2 quota tracking.
 *
 * Architecture:
 *   - One active budget per organization per time period (monthly/quarterly/annual)
 *   - consumeBudget() atomically increments consumed grams after each routing decision
 *   - getBudgetStatus() is a cheap read for dashboards and API responses
 *   - All failures are non-fatal — budget tracking must never block routing
 *
 * Status tiers:
 *   within   → consumedCO2Grams < budgetCO2Grams * warningThresholdPct
 *   warning  → consumedCO2Grams >= budgetCO2Grams * warningThresholdPct
 *   exceeded → consumedCO2Grams >= budgetCO2Grams
 */

import { prisma } from './db'

export type BudgetPeriod = 'monthly' | 'quarterly' | 'annual'
export type BudgetStatusTier = 'within' | 'warning' | 'exceeded'

export interface BudgetStatus {
  budgetCO2Grams: number
  consumedCO2Grams: number
  remainingCO2Grams: number
  utilizationPct: number
  status: BudgetStatusTier
  periodEnd: Date
}

function deriveStatusTier(
  consumed: number,
  budget: number,
  warningThresholdPct: number
): BudgetStatusTier {
  if (consumed >= budget) return 'exceeded'
  if (consumed >= budget * warningThresholdPct) return 'warning'
  return 'within'
}

function toStatus(row: {
  budgetCO2Grams: number
  consumedCO2Grams: number
  warningThresholdPct: number
  periodEnd: Date
}): BudgetStatus {
  const remaining = Math.max(0, row.budgetCO2Grams - row.consumedCO2Grams)
  const utilizationPct =
    row.budgetCO2Grams > 0
      ? Math.round((row.consumedCO2Grams / row.budgetCO2Grams) * 100)
      : 0
  return {
    budgetCO2Grams: row.budgetCO2Grams,
    consumedCO2Grams: row.consumedCO2Grams,
    remainingCO2Grams: remaining,
    utilizationPct,
    status: deriveStatusTier(row.consumedCO2Grams, row.budgetCO2Grams, row.warningThresholdPct),
    periodEnd: row.periodEnd,
  }
}

/**
 * Atomically add co2Grams to the organization's active budget period.
 * Returns null when no active budget is configured — callers must handle gracefully.
 * Never throws — all errors are swallowed and logged.
 */
export async function consumeBudget(
  organizationId: string,
  co2Grams: number
): Promise<BudgetStatus | null> {
  if (co2Grams <= 0) return getBudgetStatus(organizationId)

  try {
    const now = new Date()
    const budget = await (prisma as any).carbonBudget.findFirst({
      where: {
        organizationId,
        periodStart: { lte: now },
        periodEnd: { gte: now },
      },
    })
    if (!budget) return null

    const updated = await (prisma as any).carbonBudget.update({
      where: { id: budget.id },
      data: { consumedCO2Grams: { increment: co2Grams } },
    })

    const status = toStatus(updated)
    if (status.status !== 'within') {
      console.warn(
        `[budget] org=${organizationId} status=${status.status} ` +
          `consumed=${status.consumedCO2Grams.toFixed(0)}g ` +
          `budget=${status.budgetCO2Grams.toFixed(0)}g (${status.utilizationPct}%)`
      )
    }
    return status
  } catch (err: any) {
    console.error('[budget] consumeBudget failed:', err?.message ?? err)
    return null
  }
}

/**
 * Read current budget state without modifying it.
 * Returns null when no active budget period exists for the organization.
 */
export async function getBudgetStatus(
  organizationId: string
): Promise<BudgetStatus | null> {
  try {
    const now = new Date()
    const budget = await (prisma as any).carbonBudget.findFirst({
      where: {
        organizationId,
        periodStart: { lte: now },
        periodEnd: { gte: now },
      },
    })
    if (!budget) return null
    return toStatus(budget)
  } catch (err: any) {
    console.error('[budget] getBudgetStatus failed:', err?.message ?? err)
    return null
  }
}
