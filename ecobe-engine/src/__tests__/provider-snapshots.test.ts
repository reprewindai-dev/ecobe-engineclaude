import { canonicalizeProviderIdentity } from '../lib/routing/provider-snapshots'

describe('provider snapshot identity canonicalization', () => {
  it('collapses ember aliases to the structural baseline identity', () => {
    expect(canonicalizeProviderIdentity('ember')).toBe('EMBER_STRUCTURAL_BASELINE')
    expect(canonicalizeProviderIdentity('EMBER_STRUCTURAL_BASELINE')).toBe('EMBER_STRUCTURAL_BASELINE')
  })

  it('normalizes WattTime provider naming to a single live identity', () => {
    expect(canonicalizeProviderIdentity('watttime')).toBe('WATTTIME_MOER')
    expect(canonicalizeProviderIdentity('WATTTIME_MOER')).toBe('WATTTIME_MOER')
    expect(canonicalizeProviderIdentity('WATTTIME_MOER_FORECAST')).toBe('WATTTIME_MOER')
  })

  it('preserves computed Canada providers as first-class canonical identities', () => {
    expect(canonicalizeProviderIdentity('on_carbon')).toBe('ON_CARBON')
    expect(canonicalizeProviderIdentity('qc_carbon')).toBe('QC_CARBON')
    expect(canonicalizeProviderIdentity('bc_carbon')).toBe('BC_CARBON')
  })

  it('collapses direct-source aliases and cached prefixes to canonical inventory identities', () => {
    expect(canonicalizeProviderIdentity('EIA930_DIRECT_SUBREGION_HEURISTIC')).toBe('EIA_930')
    expect(canonicalizeProviderIdentity('GRIDSTATUS_FUEL_MIX_IPCC')).toBe('GRIDSTATUS')
    expect(canonicalizeProviderIdentity('GB_CARBON_INTENSITY_API')).toBe('GB_CARBON')
    expect(canonicalizeProviderIdentity('DK_ENERGI_DATA_SERVICE')).toBe('DK_CARBON')
    expect(canonicalizeProviderIdentity('FI_FINGRID')).toBe('FI_CARBON')
    expect(canonicalizeProviderIdentity('CACHED_EIA930_DIRECT_SUBREGION_HEURISTIC')).toBe('EIA_930')
    expect(canonicalizeProviderIdentity('LKG_GRIDSTATUS_FUEL_MIX_IPCC')).toBe('GRIDSTATUS')
  })
})
