/**
 * Cloud Region <-> Balancing Authority Mapping
 *
 * Maps cloud provider regions to US balancing authorities for EIA-930 data.
 * Non-US regions intentionally return null and rely on their regional carbon providers.
 */

export interface RegionMapping {
  cloudRegion: string
  balancingAuthority: string | null
  eiaRespondent: string | null
  country: string
  hasEia930Coverage: boolean
  notes?: string
}

const REGION_MAP: RegionMapping[] = [
  // AWS
  { cloudRegion: 'us-east-1', balancingAuthority: 'PJM', eiaRespondent: 'PJM', country: 'US', hasEia930Coverage: true, notes: 'Northern Virginia, PJM territory' },
  { cloudRegion: 'us-east-2', balancingAuthority: 'PJM', eiaRespondent: 'PJM', country: 'US', hasEia930Coverage: true, notes: 'Ohio, PJM territory' },
  { cloudRegion: 'us-west-1', balancingAuthority: 'CISO', eiaRespondent: 'CISO', country: 'US', hasEia930Coverage: true, notes: 'Northern California, CAISO territory' },
  { cloudRegion: 'us-west-2', balancingAuthority: 'BPAT', eiaRespondent: 'BPAT', country: 'US', hasEia930Coverage: true, notes: 'Oregon, BPA territory' },
  { cloudRegion: 'ca-central-1', balancingAuthority: null, eiaRespondent: null, country: 'CA', hasEia930Coverage: false, notes: 'Montreal / Quebec doctrine region' },
  { cloudRegion: 'eu-west-1', balancingAuthority: null, eiaRespondent: null, country: 'IE', hasEia930Coverage: false, notes: 'Ireland - no EIA coverage' },
  { cloudRegion: 'eu-west-2', balancingAuthority: null, eiaRespondent: null, country: 'GB', hasEia930Coverage: false, notes: 'London - no EIA coverage' },
  { cloudRegion: 'eu-central-1', balancingAuthority: null, eiaRespondent: null, country: 'DE', hasEia930Coverage: false, notes: 'Frankfurt - no EIA coverage' },
  { cloudRegion: 'eu-north-1', balancingAuthority: null, eiaRespondent: null, country: 'SE', hasEia930Coverage: false, notes: 'Stockholm / Sweden doctrine region' },
  { cloudRegion: 'ap-southeast-1', balancingAuthority: null, eiaRespondent: null, country: 'SG', hasEia930Coverage: false, notes: 'Singapore - no EIA coverage' },
  { cloudRegion: 'ap-northeast-1', balancingAuthority: null, eiaRespondent: null, country: 'JP', hasEia930Coverage: false, notes: 'Tokyo - no EIA coverage' },
  { cloudRegion: 'ap-south-1', balancingAuthority: null, eiaRespondent: null, country: 'IN', hasEia930Coverage: false, notes: 'Mumbai - no EIA coverage' },

  // GCP
  { cloudRegion: 'us-central1', balancingAuthority: 'MISO', eiaRespondent: 'MISO', country: 'US', hasEia930Coverage: true, notes: 'Iowa, MISO territory' },
  { cloudRegion: 'us-east4', balancingAuthority: 'PJM', eiaRespondent: 'PJM', country: 'US', hasEia930Coverage: true, notes: 'Northern Virginia, PJM territory' },
  { cloudRegion: 'us-west1', balancingAuthority: 'BPAT', eiaRespondent: 'BPAT', country: 'US', hasEia930Coverage: true, notes: 'Oregon, BPA territory' },
  { cloudRegion: 'northamerica-northeast1', balancingAuthority: null, eiaRespondent: null, country: 'CA', hasEia930Coverage: false, notes: 'Montreal / Quebec doctrine region' },
  { cloudRegion: 'northamerica-northeast2', balancingAuthority: null, eiaRespondent: null, country: 'CA', hasEia930Coverage: false, notes: 'Toronto / Ontario doctrine region' },
  { cloudRegion: 'europe-north1', balancingAuthority: null, eiaRespondent: null, country: 'FI', hasEia930Coverage: false, notes: 'Finland / Nordic doctrine region' },
  { cloudRegion: 'europe-west1', balancingAuthority: null, eiaRespondent: null, country: 'BE', hasEia930Coverage: false, notes: 'Belgium - no EIA coverage' },

  // Azure
  { cloudRegion: 'eastus', balancingAuthority: 'PJM', eiaRespondent: 'PJM', country: 'US', hasEia930Coverage: true, notes: 'Virginia, PJM territory' },
  { cloudRegion: 'eastus2', balancingAuthority: 'PJM', eiaRespondent: 'PJM', country: 'US', hasEia930Coverage: true, notes: 'Virginia, PJM territory' },
  { cloudRegion: 'westus2', balancingAuthority: 'BPAT', eiaRespondent: 'BPAT', country: 'US', hasEia930Coverage: true, notes: 'Washington, BPA territory' },
  { cloudRegion: 'centralus', balancingAuthority: 'SPP', eiaRespondent: 'SPP', country: 'US', hasEia930Coverage: true, notes: 'Iowa, SPP territory' },
  { cloudRegion: 'southcentralus', balancingAuthority: 'ERCO', eiaRespondent: 'ERCO', country: 'US', hasEia930Coverage: true, notes: 'Texas, ERCOT territory' },
  { cloudRegion: 'canadacentral', balancingAuthority: null, eiaRespondent: null, country: 'CA', hasEia930Coverage: false, notes: 'Azure Canada Central / Ontario doctrine region' },
  { cloudRegion: 'canadaeast', balancingAuthority: null, eiaRespondent: null, country: 'CA', hasEia930Coverage: false, notes: 'Azure Canada East / Quebec doctrine region' },
  { cloudRegion: 'canadawest', balancingAuthority: null, eiaRespondent: null, country: 'CA', hasEia930Coverage: false, notes: 'Azure Canada West / Calgary, Alberta region (not BC doctrine)' },
  { cloudRegion: 'norwayeast', balancingAuthority: null, eiaRespondent: null, country: 'NO', hasEia930Coverage: false, notes: 'Azure Norway East / Nordic doctrine region' },
  { cloudRegion: 'norwaywest', balancingAuthority: null, eiaRespondent: null, country: 'NO', hasEia930Coverage: false, notes: 'Azure Norway West / Nordic doctrine region' },
  { cloudRegion: 'swedencentral', balancingAuthority: null, eiaRespondent: null, country: 'SE', hasEia930Coverage: false, notes: 'Azure Sweden Central / Nordic doctrine region' },
]

const regionIndex = new Map(REGION_MAP.map((mapping) => [mapping.cloudRegion, mapping]))

export function getRegionMapping(cloudRegion: string): RegionMapping | null {
  return regionIndex.get(cloudRegion) ?? null
}

export function hasEia930Coverage(cloudRegion: string): boolean {
  return regionIndex.get(cloudRegion)?.hasEia930Coverage ?? false
}

export function getEiaRespondent(cloudRegion: string): string | null {
  return regionIndex.get(cloudRegion)?.eiaRespondent ?? null
}

export function getBalancingAuthority(cloudRegion: string): string | null {
  return regionIndex.get(cloudRegion)?.balancingAuthority ?? null
}

export function getUsBalancingAuthorities(): Array<{
  region: string
  balancingAuthority: string
  eiaRespondent: string
}> {
  const seen = new Set<string>()
  const result: Array<{ region: string; balancingAuthority: string; eiaRespondent: string }> = []

  for (const mapping of REGION_MAP) {
    if (!mapping.hasEia930Coverage || !mapping.balancingAuthority || !mapping.eiaRespondent) {
      continue
    }
    if (seen.has(mapping.balancingAuthority)) {
      continue
    }
    seen.add(mapping.balancingAuthority)
    result.push({
      region: mapping.balancingAuthority,
      balancingAuthority: mapping.balancingAuthority,
      eiaRespondent: mapping.eiaRespondent,
    })
  }

  return result
}

export function getAllMappedRegions(): RegionMapping[] {
  return [...REGION_MAP]
}
