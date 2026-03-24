import { prisma } from '../db'

export type CarbonBudgetPeriod = 'MONTHLY' | 'QUARTERLY' | 'YEARLY'
export type CarbonBudgetStatus = 'ACTIVE' | 'PAUSED'
export type CarbonBudgetHealth = 'on_track' | 'at_risk' | 'breached'

export interface CarbonBudgetPolicyRecord {
  id: string
  orgId: string
  name: string
  workloadType?: string | null
  budgetPeriod: CarbonBudgetPeriod
  maxCarbonKgCo2e: number
  targetReductionPct?: number | null
  targetLowerHalfSharePct?: number | null
  hardEnforcement: boolean
  policyMode: string
  status: CarbonBudgetStatus
  metadata?: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date
}

export interface LedgerPolicyEntry {
  workloadType?: string | null
  createdAt: Date
  chosenCarbonG: number
  baselineCarbonG: number
  lowerHalfQualified?: boolean | null
}

export interface ProjectedCarbonUsage {
  workloadType?: string | null
  chosenCarbonG: number
  baselineCarbonG: number
  lowerHalfQualified?: boolean | null
}

export interface CarbonBudgetEvaluation {
  id: string
  name: string
  workloadType: string | null
  budgetPeriod: CarbonBudgetPeriod
  policyMode: string
  hardEnforcement: boolean
  period: {
    start: string
    end: string
    elapsedPct: number
  }
  budget: {
    maxCarbonKgCo2e: number
    usedKgCo2e: number
    projectedKgCo2e: number
    remainingKgCo2e: number
    utilizationPct: number
    projectedUtilizationPct: number
  }
  sla: {
    targetReductionPct: number | null
    achievedReductionPct: number | null
    targetLowerHalfSharePct: number | null
    achievedLowerHalfSharePct: number | null
  }
  routing: {
    evaluatedDecisions: number
    lowerHalfQualifiedDecisions: number
  }
  status: CarbonBudgetHealth
  hardStopTriggered: boolean
  recommendation: string
}

export class CarbonBudgetViolationError extends Error {
  code = 'CARBON_BUDGET_EXCEEDED' as const
  evaluations: CarbonBudgetEvaluation[]

  constructor(evaluations: CarbonBudgetEvaluation[]) {
    super('Carbon budget policy blocked this routing decision')
    this.evaluations = evaluations
  }
}

export function calculateBudgetWindow(
  period: CarbonBudgetPeriod,
  now: Date = new Date()
): { start: Date; end: Date } {
  const current = new Date(now)

  if (period === 'YEARLY') {
    const start = new Date(Date.UTC(current.getUTCFullYear(), 0, 1, 0, 0, 0, 0))
    const end = new Date(Date.UTC(current.getUTCFullYear() + 1, 0, 1, 0, 0, 0, 0))
    return { start, end }
  }

  if (period === 'QUARTERLY') {
    const quarterStartMonth = Math.floor(current.getUTCMonth() / 3) * 3
    const start = new Date(Date.UTC(current.getUTCFullYear(), quarterStartMonth, 1, 0, 0, 0, 0))
    const end = new Date(Date.UTC(current.getUTCFullYear(), quarterStartMonth + 3, 1, 0, 0, 0, 0))
    return { start, end }
  }

  const start = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1, 0, 0, 0, 0))
  const end = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1, 0, 0, 0, 0))
  return { start, end }
}

export function evaluateBudgetPolicy(
  policy: CarbonBudgetPolicyRecord,
  entries: LedgerPolicyEntry[],
  now: Date = new Date(),
  projected?: ProjectedCarbonUsage | null
): CarbonBudgetEvaluation {
  const { start, end } = calculateBudgetWindow(policy.budgetPeriod, now)
  const scopedEntries = entries.filter((entry) => matchesWorkload(policy, entry.workloadType ?? null))
  const effectiveProjected =
    projected && matchesWorkload(policy, projected.workloadType ?? null) ? projected : null

  const usedG = scopedEntries.reduce((sum, entry) => sum + entry.chosenCarbonG, 0)
  const baselineG = scopedEntries.reduce((sum, entry) => sum + entry.baselineCarbonG, 0)
  const projectedG = usedG + (effectiveProjected?.chosenCarbonG ?? 0)
  const projectedBaselineG = baselineG + (effectiveProjected?.baselineCarbonG ?? 0)

  const lowerHalfQualifiedDecisions = scopedEntries.filter((entry) => entry.lowerHalfQualified === true).length
  const lowerHalfProjectedQualified =
    lowerHalfQualifiedDecisions + (effectiveProjected?.lowerHalfQualified === true ? 1 : 0)
  const evaluatedDecisions = scopedEntries.length + (effectiveProjected ? 1 : 0)

  const elapsedPct =
    end.getTime() === start.getTime()
      ? 100
      : clamp(((now.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 100, 0, 100)
  const maxCarbonG = policy.maxCarbonKgCo2e * 1000
  const utilizationPct = maxCarbonG > 0 ? (usedG / maxCarbonG) * 100 : 0
  const projectedUtilizationPct = maxCarbonG > 0 ? (projectedG / maxCarbonG) * 100 : 0
  const achievedReductionPct =
    projectedBaselineG > 0 ? ((projectedBaselineG - projectedG) / projectedBaselineG) * 100 : null
  const achievedLowerHalfSharePct =
    evaluatedDecisions > 0 ? (lowerHalfProjectedQualified / evaluatedDecisions) * 100 : null

  const status = determineBudgetHealth({
    elapsedPct,
    projectedUtilizationPct,
    targetReductionPct: policy.targetReductionPct ?? null,
    achievedReductionPct,
    targetLowerHalfSharePct: policy.targetLowerHalfSharePct ?? null,
    achievedLowerHalfSharePct,
  })

  return {
    id: policy.id,
    name: policy.name,
    workloadType: policy.workloadType ?? null,
    budgetPeriod: policy.budgetPeriod,
    policyMode: policy.policyMode,
    hardEnforcement: policy.hardEnforcement,
    period: {
      start: start.toISOString(),
      end: end.toISOString(),
      elapsedPct: round2(elapsedPct),
    },
    budget: {
      maxCarbonKgCo2e: round3(policy.maxCarbonKgCo2e),
      usedKgCo2e: round3(usedG / 1000),
      projectedKgCo2e: round3(projectedG / 1000),
      remainingKgCo2e: round3(Math.max(0, (maxCarbonG - projectedG) / 1000)),
      utilizationPct: round2(utilizationPct),
      projectedUtilizationPct: round2(projectedUtilizationPct),
    },
    sla: {
      targetReductionPct: policy.targetReductionPct ?? null,
      achievedReductionPct: achievedReductionPct != null ? round2(achievedReductionPct) : null,
      targetLowerHalfSharePct: policy.targetLowerHalfSharePct ?? null,
      achievedLowerHalfSharePct:
        achievedLowerHalfSharePct != null ? round2(achievedLowerHalfSharePct) : null,
    },
    routing: {
      evaluatedDecisions,
      lowerHalfQualifiedDecisions: lowerHalfProjectedQualified,
    },
    status,
    hardStopTriggered: policy.hardEnforcement && projectedUtilizationPct > 100,
    recommendation: buildRecommendation(status, policy, projectedUtilizationPct),
  }
}

export async function listCarbonBudgetPolicies(
  orgId: string
): Promise<CarbonBudgetPolicyRecord[]> {
  return prisma.carbonBudgetPolicy.findMany({
    where: { orgId },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
  }) as unknown as Promise<CarbonBudgetPolicyRecord[]>
}

export async function upsertCarbonBudgetPolicy(input: {
  id?: string
  orgId: string
  name: string
  workloadType?: string | null
  budgetPeriod: CarbonBudgetPeriod
  maxCarbonKgCo2e: number
  targetReductionPct?: number | null
  targetLowerHalfSharePct?: number | null
  hardEnforcement?: boolean
  policyMode?: string
  status?: CarbonBudgetStatus
  metadata?: Record<string, unknown>
}): Promise<CarbonBudgetPolicyRecord> {
  if (input.id) {
    return prisma.carbonBudgetPolicy.update({
      where: { id: input.id },
      data: {
        name: input.name,
        workloadType: input.workloadType ?? null,
        budgetPeriod: input.budgetPeriod,
        maxCarbonKgCo2e: input.maxCarbonKgCo2e,
        targetReductionPct: input.targetReductionPct ?? null,
        targetLowerHalfSharePct: input.targetLowerHalfSharePct ?? null,
        hardEnforcement: input.hardEnforcement ?? false,
        policyMode: input.policyMode ?? 'sec_disclosure_strict',
        status: input.status ?? 'ACTIVE',
        metadata: input.metadata ?? {},
      },
    }) as unknown as Promise<CarbonBudgetPolicyRecord>
  }

  return prisma.carbonBudgetPolicy.create({
    data: {
      orgId: input.orgId,
      name: input.name,
      workloadType: input.workloadType ?? null,
      budgetPeriod: input.budgetPeriod,
      maxCarbonKgCo2e: input.maxCarbonKgCo2e,
      targetReductionPct: input.targetReductionPct ?? null,
      targetLowerHalfSharePct: input.targetLowerHalfSharePct ?? null,
      hardEnforcement: input.hardEnforcement ?? false,
      policyMode: input.policyMode ?? 'sec_disclosure_strict',
      status: input.status ?? 'ACTIVE',
      metadata: input.metadata ?? {},
    },
  }) as unknown as Promise<CarbonBudgetPolicyRecord>
}

export async function evaluateOrgCarbonBudgets(
  orgId: string,
  options?: {
    workloadType?: string | null
    now?: Date
    projected?: ProjectedCarbonUsage | null
  }
): Promise<CarbonBudgetEvaluation[]> {
  const now = options?.now ?? new Date()
  const where: Record<string, unknown> = {
    orgId,
    status: 'ACTIVE',
  }

  if (options?.workloadType) {
    where.OR = [{ workloadType: null }, { workloadType: options.workloadType }]
  }

  const policies = (await prisma.carbonBudgetPolicy.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  })) as CarbonBudgetPolicyRecord[]

  if (policies.length === 0) {
    return []
  }

  const earliestStart = policies.reduce((earliest: Date, policy: CarbonBudgetPolicyRecord) => {
    const candidate = calculateBudgetWindow(policy.budgetPeriod as CarbonBudgetPeriod, now).start
    return candidate < earliest ? candidate : earliest
  }, now)

  const entries = (await prisma.carbonLedgerEntry.findMany({
    where: {
      orgId,
      createdAt: { gte: earliestStart, lte: now },
    },
    select: {
      workloadType: true,
      createdAt: true,
      chosenCarbonG: true,
      baselineCarbonG: true,
      lowerHalfQualified: true,
    },
  })) as LedgerPolicyEntry[]

  return policies.map((policy: CarbonBudgetPolicyRecord) => {
    const window = calculateBudgetWindow(policy.budgetPeriod as CarbonBudgetPeriod, now)
    const policyEntries = entries.filter(
      (entry) =>
        entry.createdAt >= window.start &&
        entry.createdAt < window.end &&
        matchesWorkload(policy as CarbonBudgetPolicyRecord, entry.workloadType ?? null)
    )

    return evaluateBudgetPolicy(
      policy as CarbonBudgetPolicyRecord,
      policyEntries,
      now,
      options?.projected ?? null
    )
  })
}

function determineBudgetHealth(input: {
  elapsedPct: number
  projectedUtilizationPct: number
  targetReductionPct: number | null
  achievedReductionPct: number | null
  targetLowerHalfSharePct: number | null
  achievedLowerHalfSharePct: number | null
}): CarbonBudgetHealth {
  if (input.projectedUtilizationPct > 100) return 'breached'

  const utilizationHeadroom = input.projectedUtilizationPct - input.elapsedPct
  const reductionGap =
    input.targetReductionPct != null && input.achievedReductionPct != null
      ? input.targetReductionPct - input.achievedReductionPct
      : 0
  const lowerHalfGap =
    input.targetLowerHalfSharePct != null && input.achievedLowerHalfSharePct != null
      ? input.targetLowerHalfSharePct - input.achievedLowerHalfSharePct
      : 0

  if (utilizationHeadroom > 10 || reductionGap > 5 || lowerHalfGap > 10) {
    return 'at_risk'
  }

  return 'on_track'
}

function buildRecommendation(
  status: CarbonBudgetHealth,
  policy: CarbonBudgetPolicyRecord,
  projectedUtilizationPct: number
): string {
  if (status === 'breached') {
    return policy.hardEnforcement
      ? 'Block optimize-mode workloads or raise the policy budget before dispatch.'
      : 'Shift more jobs into assurance windows or raise the approved carbon budget.'
  }

  if (status === 'at_risk') {
    if (projectedUtilizationPct > 85) {
      return 'Prefer lower-carbon regions and longer time shifting to protect remaining budget.'
    }
    return 'Tighten routing weights toward carbon and review lower-half window performance.'
  }

  return 'Policy is on track. Keep current routing mode and continue exporting disclosure evidence.'
}

function matchesWorkload(
  policy: Pick<CarbonBudgetPolicyRecord, 'workloadType'>,
  workloadType: string | null
): boolean {
  return !policy.workloadType || policy.workloadType === workloadType
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}
