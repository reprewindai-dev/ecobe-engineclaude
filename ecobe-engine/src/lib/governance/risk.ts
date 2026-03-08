import { prisma } from '../db'

interface PolicyCheckInput {
  organizationId?: string
  carbonIntensityChosenGPerKwh?: number
  carbonIntensityBaselineGPerKwh?: number
}

export interface PolicyCheckResult {
  allowed: boolean
  reason?: string
  tier: string
}

/**
 * Enforce the org's carbon policy before accepting a routing decision.
 * Returns { allowed: false, reason } if the decision violates policy.
 */
export async function checkOrgPolicy(input: PolicyCheckInput): Promise<PolicyCheckResult> {
  if (!input.organizationId) {
    return { allowed: true, tier: 'NONE' }
  }

  const policy = await (prisma as any).organizationPolicy.findUnique({
    where: { organizationId: input.organizationId },
  })

  if (!policy) {
    return { allowed: true, tier: 'STANDARD' }
  }

  // Hard carbon ceiling
  if (policy.maxCarbonGPerKwh && input.carbonIntensityChosenGPerKwh != null) {
    if (input.carbonIntensityChosenGPerKwh > policy.maxCarbonGPerKwh) {
      return {
        allowed: false,
        reason: `Carbon intensity ${input.carbonIntensityChosenGPerKwh} gCO2/kWh exceeds org ceiling of ${policy.maxCarbonGPerKwh}`,
        tier: policy.tier,
      }
    }
  }

  // Green routing requirement — chosen must be strictly greener than baseline
  if (
    policy.requireGreenRouting &&
    input.carbonIntensityChosenGPerKwh != null &&
    input.carbonIntensityBaselineGPerKwh != null
  ) {
    if (input.carbonIntensityChosenGPerKwh >= input.carbonIntensityBaselineGPerKwh) {
      return {
        allowed: false,
        reason: `Org policy requires green routing: chosen region (${input.carbonIntensityChosenGPerKwh}) is not greener than baseline (${input.carbonIntensityBaselineGPerKwh})`,
        tier: policy.tier,
      }
    }
  }

  return { allowed: true, tier: policy.tier }
}
