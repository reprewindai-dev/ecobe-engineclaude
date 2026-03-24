import { createHash } from 'crypto'
import { mkdir, readFile, stat, writeFile } from 'fs/promises'
import path from 'path'

export interface WaterDatasetDescriptor {
  name: 'aqueduct' | 'aware' | 'nrel'
  sourceUrl: string
  datasetVersion: string
  targetPath: string
  strategy: 'remote_download' | 'local_seed'
  notes?: string[]
}

export interface WaterDatasetArtifact {
  name: WaterDatasetDescriptor['name']
  source_url: string
  dataset_version: string
  file_path: string
  file_hash: string
  downloaded_at: string
  size_bytes: number
  strategy: WaterDatasetDescriptor['strategy']
  notes?: string[]
}

export interface WaterDatasetManifest {
  built_at: string
  schema_version: string
  datasets: Array<{
    name: string
    source_url: string
    file_hash: string
    downloaded_at: string
    dataset_version: string
    notes?: string[]
  }>
}

export const ENGINE_ROOT = path.resolve(__dirname, '..', '..', '..')
export const DATA_ROOT = path.join(ENGINE_ROOT, 'data')
export const RAW_WATER_ROOT = path.join(DATA_ROOT, 'raw', 'water')
export const NORMALIZED_WATER_ROOT = path.join(DATA_ROOT, 'normalized', 'water')
export const WATER_CONFIG_PATH = path.join(DATA_ROOT, 'config', 'water-region-map.json')

export const WATER_SCHEMA_VERSION = 'water_bundle_v1'

export const WATER_DATASETS: WaterDatasetDescriptor[] = [
  {
    name: 'aqueduct',
    sourceUrl: 'https://files.wri.org/aqueduct/aqueduct-4-0-water-risk-data.zip',
    datasetVersion: 'aqueduct_4_0_2023_08_16',
    targetPath: path.join(RAW_WATER_ROOT, 'aqueduct', 'aqueduct-4-0-water-risk-data.zip'),
    strategy: 'remote_download',
    notes: ['WRI Aqueduct 4.0 baseline and future water-risk data archive.'],
  },
  {
    name: 'aware',
    sourceUrl: 'https://zenodo.org/records/16332127/files/AWARE20_Countries_and_Regions.xlsx?download=1',
    datasetVersion: 'aware_2_0_2025_07_24',
    targetPath: path.join(RAW_WATER_ROOT, 'aware', 'AWARE20_Countries_and_Regions.xlsx'),
    strategy: 'remote_download',
    notes: ['AWARE2.0 country and region characterization factors workbook.'],
  },
  {
    name: 'nrel',
    sourceUrl: 'https://www.nrel.gov/docs/fy15osti/63604.pdf',
    datasetVersion: 'nrel_water_factor_library_v1',
    targetPath: path.join(RAW_WATER_ROOT, 'nrel', 'nrel-factor-library.json'),
    strategy: 'local_seed',
    notes: [
      'Pinned, pre-extracted factor table derived from official NREL water-use ranges.',
      'Stored as source material to keep decision-time routing free of live document parsing.',
    ],
  },
]

export async function ensureDirectory(directoryPath: string) {
  await mkdir(directoryPath, { recursive: true })
}

export async function ensureParentDirectory(filePath: string) {
  await ensureDirectory(path.dirname(filePath))
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T
}

export async function writeJsonFile(filePath: string, data: unknown) {
  await ensureParentDirectory(filePath)
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

export async function sha256File(filePath: string) {
  const buffer = await readFile(filePath)
  return createHash('sha256').update(buffer).digest('hex')
}

export async function describeDatasetArtifact(
  descriptor: WaterDatasetDescriptor
): Promise<WaterDatasetArtifact> {
  const fileStats = await stat(descriptor.targetPath)
  return {
    name: descriptor.name,
    source_url: descriptor.sourceUrl,
    dataset_version: descriptor.datasetVersion,
    file_path: descriptor.targetPath,
    file_hash: await sha256File(descriptor.targetPath),
    downloaded_at: fileStats.mtime.toISOString(),
    size_bytes: fileStats.size,
    strategy: descriptor.strategy,
    notes: descriptor.notes,
  }
}

export function artifactToManifestDataset(
  artifact: WaterDatasetArtifact
): WaterDatasetManifest['datasets'][number] {
  return {
    name: artifact.name,
    source_url: artifact.source_url,
    file_hash: artifact.file_hash,
    downloaded_at: artifact.downloaded_at,
    dataset_version: artifact.dataset_version,
    notes: artifact.notes,
  }
}
