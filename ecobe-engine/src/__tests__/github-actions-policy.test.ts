import { buildGithubActionsEnforcementBundle } from '../lib/enforcement/github-actions-policy'

describe('github actions enforcement policy', () => {
  it('builds executable immediate bundle for run_now', () => {
    const bundle = buildGithubActionsEnforcementBundle({
      decisionFrameId: 'df-1',
      decision: 'run_now',
      decisionMode: 'runtime_authorization',
      selectedRegion: 'us-east-1',
      preferredRegions: ['us-east-1', 'us-west-2', 'eu-west-1'],
      criticality: 'standard',
    })

    expect(bundle.executable).toBe(true)
    expect(bundle.maxParallel).toBe(1)
    expect(bundle.environment).toBe('ecobe-authorized')
    expect(bundle.matrixAllowedRegions).toEqual(['us-east-1', 'us-west-2', 'eu-west-1'])
  })

  it('builds non-executable preview bundle for scenario planning', () => {
    const bundle = buildGithubActionsEnforcementBundle({
      decisionFrameId: 'df-2',
      decision: 'reroute',
      decisionMode: 'scenario_planning',
      selectedRegion: 'eu-west-1',
      preferredRegions: ['us-east-1', 'eu-west-1'],
      criticality: 'standard',
    })

    expect(bundle.executable).toBe(false)
    expect(bundle.environment).toBe('ecobe-preview-rerouted')
    expect(bundle.matrixAllowedRegions).toEqual(['eu-west-1'])
  })

  it('builds deferred bundle for delay', () => {
    const bundle = buildGithubActionsEnforcementBundle({
      decisionFrameId: 'df-3',
      decision: 'delay',
      decisionMode: 'runtime_authorization',
      selectedRegion: 'us-west-2',
      preferredRegions: ['us-west-2'],
      criticality: 'batch',
      notBefore: '2026-04-04T15:00:00.000Z',
    })

    expect(bundle.maxParallel).toBe(0)
    expect(bundle.environment).toBe('ecobe-deferred')
    expect(bundle.notBefore).toBe('2026-04-04T15:00:00.000Z')
  })

  it('builds throttled bundle for critical traffic', () => {
    const bundle = buildGithubActionsEnforcementBundle({
      decisionFrameId: 'df-4',
      decision: 'throttle',
      decisionMode: 'runtime_authorization',
      selectedRegion: 'eu-west-1',
      preferredRegions: ['eu-west-1'],
      criticality: 'critical',
    })

    expect(bundle.maxParallel).toBe(2)
    expect(bundle.environment).toBe('ecobe-throttled')
  })

  it('builds blocked bundle for deny', () => {
    const bundle = buildGithubActionsEnforcementBundle({
      decisionFrameId: 'df-5',
      decision: 'deny',
      decisionMode: 'runtime_authorization',
      selectedRegion: 'ap-south-1',
      preferredRegions: ['ap-south-1'],
      criticality: 'standard',
    })

    expect(bundle.maxParallel).toBe(0)
    expect(bundle.environment).toBe('ecobe-blocked')
    expect(bundle.matrixAllowedRegions).toEqual([])
  })
})
