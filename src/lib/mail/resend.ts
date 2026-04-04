import { env } from '../../config/env'

interface ResendSendEmailInput {
  from: string
  to: string | string[]
  subject: string
  text: string
  html?: string
  replyTo?: string | null
}

interface ResendApiResponse {
  id?: string
  error?: {
    message?: string
  }
}

export interface MailSendResult {
  success: boolean
  id?: string
  error?: string
  usedFallbackFrom?: string
}

function getRequiredValue(value: string | undefined, name: string) {
  const trimmed = value?.trim()
  if (!trimmed) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return trimmed
}

export function getContactMailConfig() {
  return {
    from: getRequiredValue(env.RESEND_FROM_CONTACT, 'RESEND_FROM_CONTACT'),
    inbox: getRequiredValue(env.CONTACT_INBOX_EMAIL, 'CONTACT_INBOX_EMAIL'),
  }
}

export function getPublicReplyFromAddress() {
  return env.RESEND_FROM_HELLO?.trim() || 'hello@co2router.com'
}

export function getResendFallbackFromAddress() {
  return env.RESEND_FALLBACK_FROM?.trim() || 'onboarding@resend.dev'
}

export function getContactCategoryInbox(category: 'sales' | 'support' | 'security') {
  const candidate =
    category === 'support'
      ? env.CONTACT_SUPPORT_EMAIL
      : category === 'security'
        ? env.CONTACT_SECURITY_EMAIL
        : env.CONTACT_SALES_EMAIL

  return candidate?.trim() || getContactMailConfig().inbox
}

export function getFounderAlertMailConfig() {
  return {
    from: getRequiredValue(env.RESEND_FROM_ALERTS, 'RESEND_FROM_ALERTS'),
    inbox: getRequiredValue(env.FOUNDER_ALERT_EMAIL, 'FOUNDER_ALERT_EMAIL'),
  }
}

export function hasFounderAlertMailConfig() {
  return Boolean(env.RESEND_FROM_ALERTS?.trim() && env.FOUNDER_ALERT_EMAIL?.trim())
}

export function hasContactMailConfig() {
  return Boolean(
    env.RESEND_API_KEY?.trim() &&
      env.RESEND_FROM_CONTACT?.trim() &&
      env.CONTACT_INBOX_EMAIL?.trim()
  )
}

export async function sendResendEmail(input: ResendSendEmailInput): Promise<MailSendResult> {
  const apiKey = getRequiredValue(env.RESEND_API_KEY, 'RESEND_API_KEY')
  const fallbackFrom = getResendFallbackFromAddress()

  const send = async (from: string) =>
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
        reply_to: input.replyTo ?? undefined,
      }),
      signal: AbortSignal.timeout(10000),
    })

  const response = await send(input.from)

  const payload = (await response.json().catch(() => ({}))) as ResendApiResponse

  if (!response.ok && response.status === 403 && input.from !== fallbackFrom) {
    const retryResponse = await send(fallbackFrom)
    const retryPayload = (await retryResponse.json().catch(() => ({}))) as ResendApiResponse

    if (retryResponse.ok && retryPayload.id) {
      return {
        success: true,
        id: retryPayload.id,
        usedFallbackFrom: fallbackFrom,
      }
    }

    return {
      success: false,
      error:
        retryPayload.error?.message || `Resend request failed with status ${retryResponse.status}`,
    }
  }

  if (!response.ok) {
    return {
      success: false,
      error: payload.error?.message || `Resend request failed with status ${response.status}`,
    }
  }

  if (!payload.id) {
    return {
      success: false,
      error: 'Resend response did not include a message id.',
    }
  }

  return {
    success: true,
    id: payload.id,
  }
}
