import {
  buildDecisionEventSelfVerifierConfig,
  resolveDecisionEventSigningSecret,
} from '../lib/ci/event-verifier-sink'

describe('decision event self verifier sink', () => {
  it('uses the API signing secret as the authoritative verifier secret', () => {
    expect(
      resolveDecisionEventSigningSecret({
        decisionApiSignatureSecret: 'api-secret',
        decisionEventSignatureSecret: 'event-secret',
      })
    ).toBe('api-secret')
  })

  it('builds a localhost verifier sink when engine url is not configured', () => {
    const config = buildDecisionEventSelfVerifierConfig({
      port: 3004,
      internalApiKey: 'internal-key',
      decisionApiSignatureSecret: 'api-secret',
    })

    expect(config).toEqual({
      enabled: true,
      name: 'CO2 Router Decision Event Self Verifier',
      targetUrl: 'http://127.0.0.1:3004/api/v1/events/verify',
      authToken: 'internal-key',
      signingSecret: 'api-secret',
      metadata: {
        systemManaged: true,
        sinkType: 'decision_event_self_verifier',
        targetPath: '/api/v1/events/verify',
      },
    })
  })

  it('skips sink configuration when internal auth is unavailable', () => {
    expect(
      buildDecisionEventSelfVerifierConfig({
        port: 3004,
        decisionApiSignatureSecret: 'api-secret',
      })
    ).toEqual({
      enabled: false,
      reason: 'missing_internal_api_key',
    })
  })
})
