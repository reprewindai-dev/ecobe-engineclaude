import type { WaterDatasetArtifact } from './water-manifest'
import { readJsonFile } from './water-manifest'

interface RawNrelFactorTable {
  source_url: string
  dataset_version: string
  unit: 'gal_per_mwh'
  factors: Record<
    string,
    {
      min_gal_per_mwh: number
      max_gal_per_mwh: number
      median_gal_per_mwh: number
      notes?: string[]
    }
  >
}

export interface NrelProfileFactor {
  water_intensity_l_per_kwh: number
  source: 'nrel'
  dataset_version: string
  confidence: number
  mix: Record<string, number>
}

const PROFILE_MIXES: Record<string, Record<string, number>> = {
  renewables_heavy: {
    wind_onshore: 0.5,
    solar_pv_operational: 0.3,
    ngcc_closed_loop: 0.2,
  },
  gas_dominant: {
    ngcc_closed_loop: 0.75,
    wind_onshore: 0.1,
    solar_pv_operational: 0.1,
    nuclear_closed_loop: 0.05,
  },
  thermal_mixed: {
    ngcc_closed_loop: 0.45,
    coal_closed_loop: 0.3,
    nuclear_closed_loop: 0.15,
    wind_onshore: 0.05,
    solar_pv_operational: 0.05,
  },
  coal_heavy: {
    coal_closed_loop: 0.65,
    ngcc_closed_loop: 0.2,
    nuclear_closed_loop: 0.1,
    wind_onshore: 0.025,
    solar_pv_operational: 0.025,
  },
  nuclear_heavy: {
    nuclear_closed_loop: 0.7,
    ngcc_closed_loop: 0.2,
    wind_onshore: 0.05,
    solar_pv_operational: 0.05,
  },
}

export async function normalizeNrelProfiles(
  artifact: WaterDatasetArtifact
): Promise<Record<string, NrelProfileFactor>> {
  const factorTable = await readJsonFile<RawNrelFactorTable>(artifact.file_path)
  const profiles: Record<string, NrelProfileFactor> = {}

  for (const [profileName, mix] of Object.entries(PROFILE_MIXES)) {
    const medianGalPerMwh = Object.entries(mix).reduce((sum, [factorKey, weight]) => {
      const factor = factorTable.factors[factorKey]
      if (!factor) {
        throw new Error(`NREL factor table is missing ${factorKey}.`)
      }
      return sum + factor.median_gal_per_mwh * weight
    }, 0)

    profiles[profileName] = {
      water_intensity_l_per_kwh: round4((medianGalPerMwh * 3.785411784) / 1000),
      source: 'nrel',
      dataset_version: factorTable.dataset_version || artifact.dataset_version,
      confidence: 0.7,
      mix,
    }
  }

  return profiles
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000
}
