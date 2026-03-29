import 'server-only'

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

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

export function getContactMailConfig() {
  return {
    from: getRequiredEnv('RESEND_FROM_CONTACT'),
    inbox: getRequiredEnv('CONTACT_INBOX_EMAIL'),
  }
}

export function getAlertMailConfig() {
  return {
    from: getRequiredEnv('RESEND_FROM_ALERTS'),
    inbox: getRequiredEnv('ALERT_INBOX_EMAIL'),
  }
}

export async function sendResendEmail(input: ResendSendEmailInput): Promise<MailSendResult> {
  const apiKey = getRequiredEnv('RESEND_API_KEY')

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
    cache: 'no-store',
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
