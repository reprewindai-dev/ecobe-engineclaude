import { resolveClusterDoctrine } from '../lib/routing/cluster-doctrine'

const liveAverageSignal = {
  carbonIntensity: 32,
  source: 'on_carbon' as const,
  isForecast: false,
  confidence: 0.84,
  signalMode: 'average' as const,
  accountingMethod: 'average' as const,
  provenance: {
    sourceUsed: 'ON_CARBON',
    contributingSources: ['on_carbon'],
    referenceTime: new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    fallbackUsed: false,
    disagreementFlag: false,
    disagreementPct: 0,
  },
}

describe('cluster doctrine', () => {
  it('biases Ontario as the Canada clean-baseload anchor', () => {
    const doctrine = resolveClusterDoctrine('northamerica-northeast2', liveAverageSignal)

    expect(doctrine.clusterId).toBe('NA_ONTARIO_CLEAN_BASELOAD')
    expect(doctrine.clusterRole).toBe('ALWAYS_ON_PREFERRED')
    expect(doctrine.clusterBiasApplied).toBeLessThan(0)
    expect(doctrine.temporalWindowQualified).toBe(true)
  })

  it('withholds California temporal cluster when the live clean window is not qualified', () => {
    const doctrine = resolveClusterDoctrine('us-west-1', {
      ...liveAverageSignal,
      carbonIntensity: 245,
      source: 'watttime',
      provenance: {
        ...liveAverageSignal.provenance,
        sourceUsed: 'WATTTIME_MOER',
        contributingSources: ['watttime'],
      },
    })

    expect(doctrine.clusterId).toBe('NA_CA_SOLAR_WINDOW')
    expect(doctrine.clusterRole).toBe('TEMPORAL_ONLY')
    expect(doctrine.temporalWindowQualified).toBe(false)
    expect(doctrine.clusterBiasApplied).toBeGreaterThan(0)
  })
})
