import { access, readFile } from 'fs/promises'
import path from 'path'

export interface WaterBundleRegionRecord {
  waterStressScore: number
  waterStressRawRatio: number | null
  overallWaterRiskScore: number | null
  waterQualityIndex: number | null
  droughtRiskScore: number | null
  scarcityFactorAnnual: number | null
  scarcityFactorMonthly: Record<string, number>
  waterIntensityLPerKwh: number
  confidence: number
  sources: string[]
  datasetVersions: Record<string, string>
  dataQuality?: 'high' | 'medium' | 'low'
  signalType?: string
  referenceTime?: string | null
  metadata?: Record<string, unknown>
}

export interface WaterBundleManifestDataset {
  name: string
  source_url: string
  file_hash: string
  downloaded_at: string
  dataset_version: string
  notes?: string[]
}

export interface WaterBundleManifest {
  built_at: string
  schema_version: string
  datasets: WaterBundleManifestDataset[]
}

let cachedBundle: Record<string, WaterBundleRegionRecord> | null = null
let cachedManifest: WaterBundleManifest | null = null

export async function loadWaterBundle(): Promise<Record<string, WaterBundleRegionRecord>> {
  if (cachedBundle) {
    return cachedBundle
  }

  const bundlePath = await resolveWaterArtifactPath(path.join('data', 'normalized', 'water', 'water.bundle.json'))
  if (!bundlePath) {
    cachedBundle = {}
    return cachedBundle
  }

  const parsed = JSON.parse(await readFile(bundlePath, 'utf8')) as Record<string, WaterBundleRegionRecord>
  cachedBundle = parsed
  return parsed
}

export async function loadWaterManifest(): Promise<WaterBundleManifest | null> {
  if (cachedManifest) {
    return cachedManifest
  }

  const manifestPath = await resolveWaterArtifactPath(path.join('data', 'normalized', 'water', 'manifest.json'))
  if (!manifestPath) {
    return null
  }

  cachedManifest = JSON.parse(await readFile(manifestPath, 'utf8')) as WaterBundleManifest
  return cachedManifest
}

export function clearWaterBundleCache() {
  cachedBundle = null
  cachedManifest = null
}

async function resolveWaterArtifactPath(relativePath: string): Promise<string | null> {
  const candidates = [
    path.resolve(process.cwd(), relativePath),
    path.resolve(process.cwd(), '..', relativePath),
    path.resolve(process.cwd(), 'ecobe-engine', relativePath),
  ]

  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      continue
    }
  }

  return null
}
