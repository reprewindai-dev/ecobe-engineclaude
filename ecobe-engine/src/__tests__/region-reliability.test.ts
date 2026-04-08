jest.mock('../lib/redis', () => ({
  redis: {
    hgetall: jest.fn().mockResolvedValue({}),
    hset: jest.fn().mockResolvedValue(undefined),
  },
}))

import { env } from '../config/env'
import {
  computeRegionReliabilityMultiplier,
  loadRegionReliabilityMultipliers,
} from '../lib/learning/region-reliability'

describe('region reliability learning', () => {
  const originalClimatePhase = env.CLIMATE_PHASE

  afterEach(() => {
    env.CLIMATE_PHASE = originalClimatePhase
  })

  it('rewards strong outcomes within safety bounds', () => {
    const multiplier = computeRegionReliabilityMultiplier({
      total: 100,
      denyRate: 0.02,
      fallbackRate: 0.01,
      avgSavingsPct: 35,
      avgSignalConfidence: 0.92,
    })

    expect(multiplier).toBeGreaterThan(1)
    expect(multiplier).toBeLessThanOrEqual(1.2)
  })

  it('penalizes unstable outcomes within safety bounds', () => {
    const multiplier = computeRegionReliabilityMultiplier({
      total: 100,
      denyRate: 0.3,
      fallbackRate: 0.25,
      avgSavingsPct: 5,
      avgSignalConfidence: 0.3,
    })

    expect(multiplier).toBeLessThan(1)
    expect(multiplier).toBeGreaterThanOrEqual(0.8)
  })

  it('applies a conservative El Nino penalty to hydro-exposed us-west-2', async () => {
    env.CLIMATE_PHASE = 'super_el_nino'

    const multipliers = await loadRegionReliabilityMultipliers(['us-west-2', 'us-east-1'])

    expect(multipliers['us-west-2']).toBe(0.82)
    expect(multipliers['us-east-1']).toBe(1)
  })
})
