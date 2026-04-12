import { signCanonicalPayload } from '../lib/ci/canonical'
import { env } from '../config/env'
import { isAuthorizedDecisionRequest } from '../routes/ci'

describe('isAuthorizedDecisionRequest', () => {
  const originalInternalApiKey = env.ECOBE_INTERNAL_API_KEY
  const originalSignatureSecret = env.DECISION_API_SIGNATURE_SECRET

  beforeEach(() => {
    ;(env as { ECOBE_INTERNAL_API_KEY?: string }).ECOBE_INTERNAL_API_KEY = 'internal-test-key'
    ;(env as { DECISION_API_SIGNATURE_SECRET?: string }).DECISION_API_SIGNATURE_SECRET =
      'signature-test-secret'
  })

  afterAll(() => {
    ;(env as { ECOBE_INTERNAL_API_KEY?: string }).ECOBE_INTERNAL_API_KEY = originalInternalApiKey
    ;(env as { DECISION_API_SIGNATURE_SECRET?: string }).DECISION_API_SIGNATURE_SECRET =
      originalSignatureSecret
  })

  it('accepts a correctly signed decision request', () => {
    const rawBody = JSON.stringify({ requestId: 'signed-request' })
    const signature = signCanonicalPayload(rawBody, env.DECISION_API_SIGNATURE_SECRET)

    expect(
      isAuthorizedDecisionRequest({
        rawBody,
        signatureHeader: `v1=${signature}`,
        internalToken: null,
      })
    ).toBe(true)
  })

  it('accepts a valid internal token when the signature is missing', () => {
    expect(
      isAuthorizedDecisionRequest({
        rawBody: JSON.stringify({ requestId: 'internal-request' }),
        signatureHeader: undefined,
        internalToken: env.ECOBE_INTERNAL_API_KEY,
      })
    ).toBe(true)
  })

  it('rejects requests without a valid signature or internal token', () => {
    expect(
      isAuthorizedDecisionRequest({
        rawBody: JSON.stringify({ requestId: 'unauthorized-request' }),
        signatureHeader: 'v1=bad-signature',
        internalToken: 'wrong-key',
      })
    ).toBe(false)
  })
})
