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

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: input.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      reply_to: input.replyTo ?? undefined,
    }),
    signal: AbortSignal.timeout(10000),
  })

  const payload = (await response.json().catch(() => ({}))) as ResendApiResponse

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
