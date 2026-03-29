import { canonicalizeProviderIdentity } from '../lib/routing/provider-snapshots'

describe('provider snapshot identity canonicalization', () => {
  it('collapses ember aliases to the structural baseline identity', () => {
    expect(canonicalizeProviderIdentity('ember')).toBe('EMBER_STRUCTURAL_BASELINE')
    expect(canonicalizeProviderIdentity('EMBER_STRUCTURAL_BASELINE')).toBe('EMBER_STRUCTURAL_BASELINE')
  })

  it('normalizes WattTime provider naming to a single live identity', () => {
    expect(canonicalizeProviderIdentity('watttime')).toBe('WATTTIME_MOER')
    expect(canonicalizeProviderIdentity('WATTTIME_MOER')).toBe('WATTTIME_MOER')
  })
})
