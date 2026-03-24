import { buildWaterBundle } from '../src/ingestion/water/build-water-bundle'
import { fetchWaterDatasets } from '../src/ingestion/water/fetch-water-datasets'
import { mapWaterRegions } from '../src/ingestion/water/map-water-regions'
import { normalizeAqueductByCountry } from '../src/ingestion/water/normalize-aqueduct'
import { normalizeAwareByCountry } from '../src/ingestion/water/normalize-aware'
import { normalizeNrelProfiles } from '../src/ingestion/water/normalize-nrel'
import { validateWaterDatasets } from '../src/ingestion/water/validate-water-datasets'

async function main() {
  const { artifacts, reused } = await fetchWaterDatasets()
  const validation = await validateWaterDatasets(artifacts)
  if (!validation.valid) {
    throw new Error('Water dataset validation failed.')
  }

  const aqueductArtifact = artifacts.find((artifact) => artifact.name === 'aqueduct')
  const awareArtifact = artifacts.find((artifact) => artifact.name === 'aware')
  const nrelArtifact = artifacts.find((artifact) => artifact.name === 'nrel')

  if (!aqueductArtifact || !awareArtifact || !nrelArtifact) {
    throw new Error('One or more required water datasets are missing after fetch.')
  }

  const aqueductByCountry = await normalizeAqueductByCountry(aqueductArtifact)
  const awareByCountry = await normalizeAwareByCountry(awareArtifact)
  const nrelProfiles = await normalizeNrelProfiles(nrelArtifact)
  const mapped = await mapWaterRegions({
    aqueductByCountry,
    awareByCountry,
    nrelProfiles,
  })

  const { manifest, waterBundle } = await buildWaterBundle({
    aqueductRegions: mapped.aqueductRegions,
    awareRegions: mapped.awareRegions,
    mappedRegions: mapped.mappedRegions,
    nrelProfiles,
    datasetArtifacts: artifacts,
  })

  const summary = {
    reused,
    validatedDatasets: validation.summaries,
    regions: Object.keys(waterBundle).length,
    manifest,
  }

  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error('Water ingestion failed:', error)
  process.exitCode = 1
})
