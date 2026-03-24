import type { WaterBundleRegionRecord } from '../../lib/water/bundle'
import type { AqueductCountryRecord } from './normalize-aqueduct'
import type { AwareCountryRecord } from './normalize-aware'
import type { NrelProfileFactor } from './normalize-nrel'
import {
  NORMALIZED_WATER_ROOT,
  WATER_SCHEMA_VERSION,
  artifactToManifestDataset,
  type WaterDatasetArtifact,
  writeJsonFile,
} from './water-manifest'
import path from 'path'

export async function buildWaterBundle(args: {
  aqueductRegions: Record<string, AqueductCountryRecord & { region: string }>
  awareRegions: Record<string, AwareCountryRecord & { region: string }>
  mappedRegions: Record<
    string,
    {
      region: string
      aqueduct: AqueductCountryRecord
      aware: AwareCountryRecord
      nrel: NrelProfileFactor
      notes: string[]
    }
  >
  nrelProfiles: Record<string, NrelProfileFactor>
  datasetArtifacts: WaterDatasetArtifact[]
}) {
  const builtAt = new Date().toISOString()
  const waterBundle: Record<string, WaterBundleRegionRecord> = {}

  for (const [region, mapped] of Object.entries(args.mappedRegions)) {
    const confidence = round4(
      ((mapped.aqueduct.confidence ?? 0) +
        (mapped.aware.confidence ?? 0) +
        (mapped.nrel.confidence ?? 0)) /
        3
    )
    const dataQuality = confidence >= 0.8 ? 'high' : confidence >= 0.55 ? 'medium' : 'low'

    waterBundle[region] = {
      waterStressScore: mapped.aqueduct.water_stress_score,
      waterStressRawRatio: mapped.aqueduct.water_stress_raw_ratio,
      overallWaterRiskScore: mapped.aqueduct.overall_water_risk_score,
      waterQualityIndex: mapped.aqueduct.water_quality_index,
      droughtRiskScore: mapped.aqueduct.drought_risk_score,
      scarcityFactorAnnual: mapped.aware.scarcity_factor_annual,
      scarcityFactorMonthly: mapped.aware.scarcity_factor_monthly,
      waterIntensityLPerKwh: mapped.nrel.water_intensity_l_per_kwh,
      confidence,
      sources: ['aqueduct', 'aware_2_0', 'nrel'],
      datasetVersions: {
        aqueduct: mapped.aqueduct.dataset_version,
        aware: mapped.aware.dataset_version,
        nrel: mapped.nrel.dataset_version,
      },
      dataQuality,
      signalType: 'scarcity_weighted_operational',
      referenceTime: builtAt,
      metadata: {
        mappingNotes: mapped.notes,
        nrelMix: mapped.nrel.mix,
      },
    }
  }

  const manifest = {
    built_at: builtAt,
    schema_version: WATER_SCHEMA_VERSION,
    datasets: args.datasetArtifacts.map(artifactToManifestDataset),
  }

  await writeJsonFile(
    path.join(NORMALIZED_WATER_ROOT, 'aqueduct.regions.json'),
    args.aqueductRegions
  )
  await writeJsonFile(path.join(NORMALIZED_WATER_ROOT, 'aware.regions.json'), args.awareRegions)
  await writeJsonFile(path.join(NORMALIZED_WATER_ROOT, 'nrel.factors.json'), args.nrelProfiles)
  await writeJsonFile(path.join(NORMALIZED_WATER_ROOT, 'water.bundle.json'), waterBundle)
  await writeJsonFile(path.join(NORMALIZED_WATER_ROOT, 'manifest.json'), manifest)

  return {
    waterBundle,
    manifest,
  }
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000
}
