import { z } from 'zod'

import { env } from '../../config/env'
import type { WaterDecisionAction, WaterPolicyProfile } from '../water/types'
import { evaluateInternalSekedPolicy } from './seked-internal'

const SekedGovernanceWeightsSchema = z.object({
  carbon: z.number().nullable().optional(),
  water: z.number().nullable().optional(),
  latency: z.number().nullable().optional(),
  cost: z.number().nullable().optional(),
})

const SekedGovernanceThresholdsSchema = z.object({
  amberMin: z.number().optional(),
  redMin: z.number().optional(),
  minSignalConfidence: z.number().optional(),
  waterStressDelay: z.number().optional(),
  waterStressDeny: z.number().optional(),
})

const SekedPolicyCandidateSchema = z.object({
  region: z.string(),
  score: z.number(),
  carbonIntensity: z.number(),
  waterStressIndex: z.number(),
  waterScarcityImpact: z.number(),
  guardrailCandidateBlocked: z.boolean(),
})

const SekedPolicyAdapterRequestSchema = z.object({
  decisionFrameId: z.string(),
  policyProfile: z.enum([
    'default',
    'drought_sensitive',
    'eu_data_center_reporting',
    'high_water_sensitivity',
  ]),
  policyVersion: z.string(),
  decisionMode: z.enum(['runtime_authorization', 'scenario_planning']),
  criticality: z.enum(['critical', 'standard', 'batch']),
  allowDelay: z.boolean(),
  facilityId: z.string().nullable(),
  scenario: z.enum(['current', '2030', '2050', '2080']),
  bottleneckScore: z.number().nullable(),
  preferredRegions: z.array(z.string()),
  waterAuthority: z.object({
    authorityMode: z.enum(['basin', 'facility_overlay', 'fallback']),
    confidence: z.number(),
    supplierSet: z.array(z.string()),
    evidenceRefs: z.array(z.string()),
  }),
  candidateSupplierProvenance: z.array(
    z.object({
      region: z.string(),
      supplierSet: z.array(z.string()),
      evidenceRefs: z.array(z.string()),
      authorityMode: z.enum(['basin', 'facility_overlay', 'fallback']),
    })
  ),
  weights: z
    .object({
      carbon: z.number().nullable(),
      water: z.number().nullable(),
      latency: z.number().nullable(),
      cost: z.number().nullable(),
    })
    .optional(),
  strict: z.boolean().optional(),
  candidates: z.array(SekedPolicyCandidateSchema),
  provisionalDecision: z.object({
    action: z.enum(['run_now', 'reroute', 'delay', 'throttle', 'deny']),
    reasonCode: z.string(),
    selectedRegion: z.string(),
    baselineRegion: z.string(),
  }),
  timestamp: z.string(),
})

const SekedDirectiveSchema = z.object({
  allow: z.boolean().optional(),
  action: z.enum(['run_now', 'reroute', 'delay', 'throttle', 'deny']).optional(),
  reasonCode: z.string().optional(),
  forceRegion: z.string().optional(),
  denyRegions: z.array(z.string()).optional(),
  maxWaterStress: z.number().optional(),
  maxCarbonIntensity: z.number().optional(),
  policyReference: z.string().optional(),
  rationale: z.string().optional(),
  governance: z
    .object({
      source: z.string().optional(),
      score: z.number().optional(),
      zone: z.enum(['green', 'amber', 'red']).optional(),
      weights: SekedGovernanceWeightsSchema.optional(),
      thresholds: SekedGovernanceThresholdsSchema.optional(),
    })
    .optional(),
})

export type SekedGovernanceWeights = z.infer<typeof SekedGovernanceWeightsSchema>
export type SekedGovernanceThresholds = z.infer<typeof SekedGovernanceThresholdsSchema>
export type SekedPolicyCandidate = z.infer<typeof SekedPolicyCandidateSchema>
export type SekedPolicyAdapterRequest = z.infer<typeof SekedPolicyAdapterRequestSchema>
export type SekedDirective = z.infer<typeof SekedDirectiveSchema>
export { SekedPolicyAdapterRequestSchema, SekedPolicyCandidateSchema }

export interface SekedPolicyAdapterResult {
  enabled: boolean
  strict: boolean
  evaluated: boolean
  applied: boolean
  hookStatus: 'not_configured' | 'skipped' | 'success' | 'error'
  reasonCodes: string[]
  policyReference: string | null
  fallbackUsed: boolean
  hardFailure: boolean
  enforcedFailureAction: WaterDecisionAction | null
  response: SekedDirective | null
}

export function parseSekedStrictProfiles() {
  const raw =
    env.SEKED_POLICY_ADAPTER_STRICT_PROFILES ??
    'drought_sensitive,eu_data_center_reporting,high_water_sensitivity'
  return new Set(
    raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  )
}

function strictFailureAction(input: { criticality: 'critical' | 'standard' | 'batch'; allowDelay: boolean }) {
  if (input.criticality === 'critical') return 'throttle' as const
  if (input.allowDelay) return 'delay' as const
  return 'deny' as const
}

export async function evaluateSekedPolicyAdapter(
  request: SekedPolicyAdapterRequest
): Promise<SekedPolicyAdapterResult> {
  const strictProfiles = parseSekedStrictProfiles()
  const strict = strictProfiles.has(request.policyProfile)
  const timeoutMs = Math.max(100, env.SEKED_POLICY_ADAPTER_TIMEOUT_MS)
  const normalizedRequest: SekedPolicyAdapterRequest = {
    ...request,
    strict,
  }

  if (!env.SEKED_POLICY_ADAPTER_ENABLED) {
    return {
      enabled: false,
      strict,
      evaluated: false,
      applied: false,
      hookStatus: 'not_configured',
      reasonCodes: ['SEKED_POLICY_ADAPTER_DISABLED_OR_UNCONFIGURED'],
      policyReference: null,
      fallbackUsed: false,
      hardFailure: false,
      enforcedFailureAction: null,
      response: null,
    }
  }

  if (!env.SEKED_POLICY_ADAPTER_URL) {
    return evaluateInternalSekedPolicy(normalizedRequest)
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-ecobe-adapter': 'seked-policy-adapter-v1',
  }
  if (env.SEKED_POLICY_ADAPTER_AUTH_TOKEN) {
    headers.authorization = `Bearer ${env.SEKED_POLICY_ADAPTER_AUTH_TOKEN}`
  }

  try {
    const response = await fetch(env.SEKED_POLICY_ADAPTER_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(normalizedRequest),
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!response.ok) {
      throw new Error(`HTTP_${response.status}`)
    }

    const parsed = SekedDirectiveSchema.parse(await response.json())
    return {
      enabled: true,
      strict,
      evaluated: true,
      applied: true,
      hookStatus: 'success',
      reasonCodes: ['SEKED_POLICY_ADAPTER_APPLIED'],
      policyReference: parsed.policyReference ?? null,
      fallbackUsed: false,
      hardFailure: false,
      enforcedFailureAction: null,
      response: parsed,
    }
  } catch (error) {
    const failureCode =
      error instanceof Error
        ? `SEKED_POLICY_ADAPTER_ERROR_${error.message}`
        : 'SEKED_POLICY_ADAPTER_ERROR_UNKNOWN'
    if (strict) {
      return {
        enabled: true,
        strict: true,
        evaluated: true,
        applied: false,
        hookStatus: 'error',
        reasonCodes: [failureCode, 'SEKED_POLICY_ADAPTER_STRICT_FAILSAFE'],
        policyReference: null,
        fallbackUsed: true,
        hardFailure: true,
        enforcedFailureAction: strictFailureAction({
          criticality: request.criticality,
          allowDelay: request.allowDelay,
        }),
        response: null,
      }
    }

    return {
      enabled: true,
      strict: false,
      evaluated: true,
      applied: false,
      hookStatus: 'error',
      reasonCodes: [failureCode, 'SEKED_POLICY_ADAPTER_NON_STRICT_CONTINUE'],
      policyReference: null,
      fallbackUsed: true,
      hardFailure: false,
      enforcedFailureAction: null,
      response: null,
    }
  }
}
