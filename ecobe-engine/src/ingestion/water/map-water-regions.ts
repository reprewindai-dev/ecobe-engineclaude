import type { AqueductCountryRecord } from './normalize-aqueduct'
import type { AwareCountryRecord } from './normalize-aware'
import type { NrelProfileFactor } from './normalize-nrel'
import { WATER_CONFIG_PATH, readJsonFile } from './water-manifest'

export interface WaterRegionMapEntry {
  aqueduct_key: string
  aware_key: string
  nrel_key: string
  notes?: string[]
}

export interface MappedWaterRegion {
  region: string
  aqueduct: AqueductCountryRecord
  aware: AwareCountryRecord
  nrel: NrelProfileFactor
  notes: string[]
}

export async function loadWaterRegionMap(): Promise<Record<string, WaterRegionMapEntry>> {
  return readJsonFile<Record<string, WaterRegionMapEntry>>(WATER_CONFIG_PATH)
}

export async function mapWaterRegions(args: {
  aqueductByCountry: Record<string, AqueductCountryRecord>
  awareByCountry: Record<string, AwareCountryRecord>
  nrelProfiles: Record<string, NrelProfileFactor>
}): Promise<{
  aqueductRegions: Record<string, AqueductCountryRecord & { region: string }>
  awareRegions: Record<string, AwareCountryRecord & { region: string }>
  mappedRegions: Record<string, MappedWaterRegion>
}> {
  const mapping = await loadWaterRegionMap()
  const aqueductRegions: Record<string, AqueductCountryRecord & { region: string }> = {}
  const awareRegions: Record<string, AwareCountryRecord & { region: string }> = {}
  const mappedRegions: Record<string, MappedWaterRegion> = {}

  for (const [region, config] of Object.entries(mapping)) {
    const aqueduct = args.aqueductByCountry[config.aqueduct_key]
    if (!aqueduct) {
      throw new Error(`Missing Aqueduct country ${config.aqueduct_key} for mapped region ${region}.`)
    }

    const aware = args.awareByCountry[config.aware_key]
    if (!aware) {
      throw new Error(`Missing AWARE country ${config.aware_key} for mapped region ${region}.`)
    }

    const nrel = args.nrelProfiles[config.nrel_key]
    if (!nrel) {
      throw new Error(`Missing NREL profile ${config.nrel_key} for mapped region ${region}.`)
    }

    aqueductRegions[region] = {
      region,
      ...aqueduct,
    }
    awareRegions[region] = {
      region,
      ...aware,
    }
    mappedRegions[region] = {
      region,
      aqueduct,
      aware,
      nrel,
      notes: config.notes ?? [],
    }
  }

  return {
    aqueductRegions,
    awareRegions,
    mappedRegions,
  }
}
