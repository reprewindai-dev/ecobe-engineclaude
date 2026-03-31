import {
  buildWaterAuthority,
  getWaterArtifactHealthSnapshot,
  resolveWaterSignal,
  validateWaterArtifacts,
} from '../lib/water/bundle'

describe('water bundle artifacts', () => {
  it('loads a configured region without fallback', () => {
    const signal = resolveWaterSignal('eu-west-1')
    expect(signal.fallbackUsed).toBe(false)
    expect(signal.waterStressIndex).toBeGreaterThanOrEqual(0)
    expect(signal.waterStressIndex).toBeLessThanOrEqual(5)
    expect(signal.datasetVersions).toHaveProperty('aqueduct')
  })

  it('uses conservative fallback for unknown regions', () => {
    const signal = resolveWaterSignal('unknown-region-1')
    expect(signal.fallbackUsed).toBe(true)
    expect(signal.dataQuality).toBe('low')
    expect(signal.waterStressIndex).toBeGreaterThanOrEqual(4)
  })

  it('reports artifact health with schema compatibility', () => {
    const health = validateWaterArtifacts()
    expect(health.checks.bundlePresent).toBe(true)
    expect(health.checks.manifestPresent).toBe(true)
    expect(health.checks.schemaCompatible).toBe(true)
    expect(health.checks.sourceCount).toBeGreaterThan(0)
  })

  it('returns a cached artifact health snapshot without forcing deep validation', () => {
    const health = validateWaterArtifacts()
    const snapshot = getWaterArtifactHealthSnapshot()

    expect(snapshot.bundleHealthy).toBe(true)
    expect(snapshot.manifestHealthy).toBe(true)
    expect(snapshot.schemaCompatible).toBe(true)
    expect(snapshot.datasetHashesPresent).toBe(health.checks.datasetHashesPresent)
    expect(snapshot.manifestDatasets.length).toBeGreaterThan(0)
  })

  it('builds a water authority object for scenario planning', () => {
    const signal = resolveWaterSignal('eu-west-1', new Date('2026-03-24T00:00:00.000Z'), {
      scenario: '2050',
    })
    const authority = buildWaterAuthority(signal)

    expect(authority.authorityMode).toBe('basin')
    expect(authority.scenario).toBe('2050')
    expect(authority.supplierSet.length).toBeGreaterThan(0)
  })
})
