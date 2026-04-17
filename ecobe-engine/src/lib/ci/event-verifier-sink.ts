import { env } from '../../config/env'
import { prisma } from '../db'

export const SELF_VERIFIER_SINK_NAME = 'CO2 Router Decision Event Self Verifier'
export const SELF_VERIFIER_TARGET_PATH = '/api/v1/events/verify'

type SelfVerifierConfigInput = {
  port: number
  internalApiKey?: string | null
  decisionApiSignatureSecret?: string | null
  decisionEventSignatureSecret?: string | null
}

type SelfVerifierConfig =
  | {
      enabled: false
      reason:
        | 'missing_internal_api_key'
        | 'missing_signing_secret'
    }
  | {
      enabled: true
      name: string
      targetUrl: string
      authToken: string
      signingSecret: string
      metadata: Record<string, unknown>
    }

export function resolveDecisionEventSigningSecret(input?: {
  decisionApiSignatureSecret?: string | null
  decisionEventSignatureSecret?: string | null
}) {
  return (
    input?.decisionApiSignatureSecret ||
    input?.decisionEventSignatureSecret ||
    env.DECISION_API_SIGNATURE_SECRET ||
    env.DECISION_EVENT_SIGNATURE_SECRET ||
    env.ECOBE_INTERNAL_API_KEY ||
    null
  )
}

export function buildDecisionEventSelfVerifierConfig(
  input: SelfVerifierConfigInput
): SelfVerifierConfig {
  if (!input.internalApiKey) {
    return {
      enabled: false,
      reason: 'missing_internal_api_key',
    }
  }

  const signingSecret = resolveDecisionEventSigningSecret({
    decisionApiSignatureSecret: input.decisionApiSignatureSecret,
    decisionEventSignatureSecret: input.decisionEventSignatureSecret,
  })

  if (!signingSecret) {
    return {
      enabled: false,
      reason: 'missing_signing_secret',
    }
  }

  return {
    enabled: true,
    name: SELF_VERIFIER_SINK_NAME,
    targetUrl: `http://127.0.0.1:${input.port}${SELF_VERIFIER_TARGET_PATH}`,
    authToken: input.internalApiKey,
    signingSecret,
    metadata: {
      systemManaged: true,
      sinkType: 'decision_event_self_verifier',
      targetPath: SELF_VERIFIER_TARGET_PATH,
    },
  }
}

export async function ensureDecisionEventVerifierSink() {
  const config = buildDecisionEventSelfVerifierConfig({
    port: env.PORT,
    internalApiKey: env.ECOBE_INTERNAL_API_KEY,
    decisionApiSignatureSecret: env.DECISION_API_SIGNATURE_SECRET,
    decisionEventSignatureSecret: env.DECISION_EVENT_SIGNATURE_SECRET,
  })

  if (!config.enabled) {
    return {
      status: 'skipped' as const,
      reason: config.reason,
    }
  }

  const existing = await prisma.integrationWebhookSink.findFirst({
    where: {
      name: config.name,
    },
    orderBy: {
      createdAt: 'asc',
    },
  })

  if (existing) {
    const updated = await prisma.integrationWebhookSink.update({
      where: { id: existing.id },
      data: {
        targetUrl: config.targetUrl,
        authToken: config.authToken,
        signingSecret: config.signingSecret,
        status: 'ACTIVE',
        metadata: config.metadata,
      },
    })

    return {
      status: 'updated' as const,
      sinkId: updated.id,
      targetUrl: updated.targetUrl,
    }
  }

  const created = await prisma.integrationWebhookSink.create({
    data: {
      name: config.name,
      targetUrl: config.targetUrl,
      authToken: config.authToken,
      signingSecret: config.signingSecret,
      status: 'ACTIVE',
      metadata: config.metadata,
    },
  })

  return {
    status: 'created' as const,
    sinkId: created.id,
    targetUrl: created.targetUrl,
  }
}
