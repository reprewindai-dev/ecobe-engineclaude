import AdmZip from 'adm-zip'

import type { WaterDatasetArtifact } from './water-manifest'

export interface AqueductCountryRecord {
  water_stress_score: number
  water_stress_raw_ratio: number | null
  overall_water_risk_score: number | null
  water_quality_index: number | null
  drought_risk_score: number | null
  source: 'aqueduct'
  dataset_version: string
  confidence: number
  aggregation: 'p90_by_country'
}

export async function normalizeAqueductByCountry(
  artifact: WaterDatasetArtifact
): Promise<Record<string, AqueductCountryRecord>> {
  const zip = new AdmZip(artifact.file_path)
  const entry =
    zip
      .getEntries()
      .find((candidate: AdmZip.IZipEntry) =>
        candidate.entryName.toLowerCase().includes('baseline_annual') &&
        candidate.entryName.toLowerCase().endsWith('.csv')
      ) ?? null

  if (!entry) {
    throw new Error('Aqueduct baseline annual CSV was not found in the mirrored zip archive.')
  }

  const csv = zip.readAsText(entry)
  const rows = parseCsv(csv)
  if (rows.length === 0) {
    throw new Error('Aqueduct baseline annual CSV did not contain any rows.')
  }

  const requiredFields = [
    'gid_0',
    'bws_raw',
    'bws_score',
    'drr_score',
    'w_awr_def_qal_score',
    'w_awr_def_tot_score',
  ]
  for (const field of requiredFields) {
    if (!(field in rows[0])) {
      throw new Error(`Aqueduct baseline annual CSV is missing required field ${field}.`)
    }
  }

  const grouped = new Map<
    string,
    {
      bwsScore: number[]
      bwsRaw: number[]
      droughtRisk: number[]
      waterQuality: number[]
      overallRisk: number[]
    }
  >()

  for (const row of rows) {
    const country = (row.gid_0 ?? '').trim().toUpperCase()
    if (!country) continue

    const bucket =
      grouped.get(country) ??
      {
        bwsScore: [],
        bwsRaw: [],
        droughtRisk: [],
        waterQuality: [],
        overallRisk: [],
      }

    pushIfFinite(bucket.bwsScore, row.bws_score)
    pushIfFinite(bucket.bwsRaw, row.bws_raw)
    pushIfFinite(bucket.droughtRisk, row.drr_score)
    pushIfFinite(bucket.waterQuality, row.w_awr_def_qal_score)
    pushIfFinite(bucket.overallRisk, row.w_awr_def_tot_score)

    grouped.set(country, bucket)
  }

  const normalized: Record<string, AqueductCountryRecord> = {}
  for (const [country, bucket] of grouped.entries()) {
    normalized[country] = {
      water_stress_score: round2(percentile(bucket.bwsScore, 0.9) ?? 3),
      water_stress_raw_ratio: nullableRound4(percentile(bucket.bwsRaw, 0.9)),
      overall_water_risk_score: nullableRound2(percentile(bucket.overallRisk, 0.9)),
      water_quality_index: nullableRound2(percentile(bucket.waterQuality, 0.9)),
      drought_risk_score: nullableRound2(percentile(bucket.droughtRisk, 0.9)),
      source: 'aqueduct',
      dataset_version: artifact.dataset_version,
      confidence: 0.84,
      aggregation: 'p90_by_country',
    }
  }

  return normalized
}

function parseCsv(csv: string): Array<Record<string, string>> {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)

  if (lines.length < 2) {
    return []
  }

  const header = parseCsvLine(lines[0]!)
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line)
    const row: Record<string, string> = {}
    header.forEach((column, index) => {
      row[column] = values[index] ?? ''
    })
    return row
  })
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
      continue
    }

    current += char
  }

  result.push(current)
  return result
}

function pushIfFinite(target: number[], value: string) {
  const numericValue = Number(value)
  if (Number.isFinite(numericValue)) {
    target.push(numericValue)
  }
}

function percentile(values: number[], quantile: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))
  return sorted[index] ?? null
}

function round2(value: number) {
  return Math.round(value * 100) / 100
}

function nullableRound2(value: number | null) {
  return value == null ? null : round2(value)
}

function nullableRound4(value: number | null) {
  return value == null ? null : Math.round(value * 10000) / 10000
}
