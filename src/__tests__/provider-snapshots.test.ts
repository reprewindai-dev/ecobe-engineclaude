jest.mock('../lib/db', () => ({
  prisma: {
    providerSnapshot: {
      createMany: jest.fn(),
    },
  },
}))

import {
  canonicalizeProviderIdentity,
  storeProviderSnapshot,
} from '../lib/routing/provider-snapshots'

import { prisma } from '../lib/db'

describe('provider snapshot identity canonicalization', () => {
  it('collapses ember aliases to the structural baseline identity', () => {
    expect(canonicalizeProviderIdentity('ember')).toBe('EMBER_STRUCTURAL_BASELINE')
    expect(canonicalizeProviderIdentity('EMBER_STRUCTURAL_BASELINE')).toBe('EMBER_STRUCTURAL_BASELINE')
  })

  it('normalizes WattTime provider naming to a single live identity', () => {
    expect(canonicalizeProviderIdentity('watttime')).toBe('WATTTIME_MOER')
    expect(canonicalizeProviderIdentity('WATTTIME_MOER')).toBe('WATTTIME_MOER')
  })

  it('does not overwrite the first observation for a unique snapshot key', async () => {
    let storedSignalValue: number | undefined
    const createMany = prisma.providerSnapshot.createMany as jest.Mock
    createMany.mockImplementation(async ({ data, skipDuplicates }) => {
      if (storedSignalValue === undefined || !skipDuplicates) {
        storedSignalValue = data[0].signalValue
      }
      return { count: 1 }
    })

    const snapshot = {
      provider: 'entsoe',
      zone: 'EU-DE',
      signalType: 'intensity',
      signalValue: 120,
      observedAt: new Date('2026-01-01T00:00:00.000Z'),
    }

    await storeProviderSnapshot(snapshot)
    await storeProviderSnapshot({ ...snapshot, signalValue: 999 })

    expect(storedSignalValue).toBe(120)
    expect(createMany).toHaveBeenCalledTimes(2)
    expect(createMany.mock.calls[0][0].skipDuplicates).toBe(true)
  })
})
