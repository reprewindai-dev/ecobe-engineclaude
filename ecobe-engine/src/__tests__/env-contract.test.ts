import { resolveProductionEnvIssues } from '../config/env'

describe('production env contract', () => {
  it('does not require production-only gates outside production', () => {
    expect(
      resolveProductionEnvIssues({
        NODE_ENV: 'test',
      })
    ).toEqual([])
  })

  it('requires the canonical production secrets and governance posture', () => {
    expect(
      resolveProductionEnvIssues({
        NODE_ENV: 'production',
        DIRECT_DATABASE_URL: '',
        ECOBE_INTERNAL_API_KEY: '',
        DECISION_API_SIGNATURE_SECRET: '',
        SEKED_POLICY_ADAPTER_ENABLED: 'false',
      })
    ).toEqual([
      'DIRECT_DATABASE_URL is required in production',
      'ECOBE_INTERNAL_API_KEY is required in production',
      'DECISION_API_SIGNATURE_SECRET is required in production',
      'SEKED_POLICY_ADAPTER_ENABLED must be true in production',
    ])
  })

  it('accepts a doctrine-complete production env contract', () => {
    expect(
      resolveProductionEnvIssues({
        NODE_ENV: 'production',
        DIRECT_DATABASE_URL: 'postgresql://direct',
        ECOBE_INTERNAL_API_KEY: 'internal-key',
        DECISION_API_SIGNATURE_SECRET: 'signature-secret',
        SEKED_POLICY_ADAPTER_ENABLED: 'true',
      })
    ).toEqual([])
  })
})
