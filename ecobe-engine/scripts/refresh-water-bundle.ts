import { refreshWaterArtifactsFromCurrentSources, getWaterArtifactHealthSnapshot } from '../src/lib/water/bundle'
import { verifyWaterDatasetProvenance } from '../src/lib/water/provenance'

const persistManifest = true
const provenance = verifyWaterDatasetProvenance({ persistManifest })
const refreshed = refreshWaterArtifactsFromCurrentSources()
const health = getWaterArtifactHealthSnapshot(true)

console.log(
  JSON.stringify(
    {
      refreshedAt: refreshed.refreshedAt,
      regionCount: refreshed.regionCount,
      datasetCount: refreshed.datasetCount,
      artifactMetadata: refreshed.artifactMetadata,
      provenanceSummary: provenance.summary,
      health: {
        healthy: health.healthy,
        bundleHealthy: health.bundleHealthy,
        manifestHealthy: health.manifestHealthy,
        schemaCompatible: health.schemaCompatible,
        datasetHashesPresent: health.datasetHashesPresent,
      },
    },
    null,
    2
  )
)
