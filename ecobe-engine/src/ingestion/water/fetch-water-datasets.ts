import { access, writeFile } from 'fs/promises'

import {
  type WaterDatasetArtifact,
  WATER_DATASETS,
  describeDatasetArtifact,
  ensureParentDirectory,
} from './water-manifest'

export async function fetchWaterDatasets(): Promise<{
  artifacts: WaterDatasetArtifact[]
  reused: string[]
}> {
  const artifacts: WaterDatasetArtifact[] = []
  const reused: string[] = []

  for (const dataset of WATER_DATASETS) {
    await ensureParentDirectory(dataset.targetPath)

    if (dataset.strategy === 'remote_download') {
      const exists = await fileExists(dataset.targetPath)
      if (!exists) {
        const response = await fetch(dataset.sourceUrl, {
          headers: {
            'user-agent': 'ecobe-water-ingestion/1.0',
          },
          redirect: 'follow',
        })

        if (!response.ok) {
          throw new Error(`Failed to download ${dataset.name}: ${response.status} ${response.statusText}`)
        }

        const buffer = Buffer.from(await response.arrayBuffer())
        await writeFile(dataset.targetPath, buffer)
      } else {
        reused.push(dataset.name)
      }
    } else {
      const exists = await fileExists(dataset.targetPath)
      if (!exists) {
        throw new Error(
          `Local seeded dataset ${dataset.name} is missing at ${dataset.targetPath}.`
        )
      }
      reused.push(dataset.name)
    }

    artifacts.push(await describeDatasetArtifact(dataset))
  }

  return { artifacts, reused }
}

async function fileExists(filePath: string) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}
