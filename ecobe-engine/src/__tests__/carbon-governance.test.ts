import { calculateBudgetWindow, evaluateBudgetPolicy } from '../lib/routing/carbon-governance'

describe('carbon governance', () => {
  it('calculates quarterly windows on UTC boundaries', () => {
    const window = calculateBudgetWindow('QUARTERLY', new Date('2026-05-15T12:00:00.000Z'))
    expect(window.start.toISOString()).toBe('2026-04-01T00:00:00.000Z')
    expect(window.end.toISOString()).toBe('2026-07-01T00:00:00.000Z')
  })

  it('marks policies breached when projected emissions exceed the budget', () => {
    const evaluation = evaluateBudgetPolicy(
      {
        id: 'policy_1',
        orgId: 'org_123',
        name: 'CI Monthly Budget',
        workloadType: 'ci/heavy',
        budgetPeriod: 'MONTHLY',
        maxCarbonKgCo2e: 1,
        targetReductionPct: 50,
        targetLowerHalfSharePct: 75,
        hardEnforcement: true,
        policyMode: 'sec_disclosure_strict',
        status: 'ACTIVE',
        metadata: {},
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        updatedAt: new Date('2026-03-01T00:00:00.000Z'),
      },
      [
        {
          workloadType: 'ci/heavy',
          createdAt: new Date('2026-03-10T00:00:00.000Z'),
          chosenCarbonG: 800,
          baselineCarbonG: 2000,
          lowerHalfQualified: false,
        },
      ],
      new Date('2026-03-20T00:00:00.000Z'),
      {
        workloadType: 'ci/heavy',
        chosenCarbonG: 400,
        baselineCarbonG: 1200,
        lowerHalfQualified: false,
      }
    )

    expect(evaluation.status).toBe('breached')
    expect(evaluation.hardStopTriggered).toBe(true)
    expect(evaluation.budget.projectedUtilizationPct).toBeGreaterThan(100)
  })

  it('keeps lower-half SLA on track when most decisions are in the lower half', () => {
    const evaluation = evaluateBudgetPolicy(
      {
        id: 'policy_2',
        orgId: 'org_123',
        name: 'Lower Half SLO',
        workloadType: null,
        budgetPeriod: 'MONTHLY',
        maxCarbonKgCo2e: 20,
        targetReductionPct: 20,
        targetLowerHalfSharePct: 60,
        hardEnforcement: false,
        policyMode: 'eu_24x7_ready',
        status: 'ACTIVE',
        metadata: {},
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        updatedAt: new Date('2026-03-01T00:00:00.000Z'),
      },
      [
        {
          workloadType: 'ci/standard',
          createdAt: new Date('2026-03-04T00:00:00.000Z'),
          chosenCarbonG: 500,
          baselineCarbonG: 1000,
          lowerHalfQualified: true,
        },
        {
          workloadType: 'ci/standard',
          createdAt: new Date('2026-03-05T00:00:00.000Z'),
          chosenCarbonG: 550,
          baselineCarbonG: 1000,
          lowerHalfQualified: true,
        },
        {
          workloadType: 'ci/standard',
          createdAt: new Date('2026-03-06T00:00:00.000Z'),
          chosenCarbonG: 600,
          baselineCarbonG: 1000,
          lowerHalfQualified: false,
        },
      ],
      new Date('2026-03-20T00:00:00.000Z')
    )

    expect(evaluation.status).toBe('on_track')
    expect(evaluation.sla.achievedLowerHalfSharePct).toBeCloseTo(66.67, 1)
  })
})
