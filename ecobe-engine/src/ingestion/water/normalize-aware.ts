import * as XLSX from 'xlsx'

import type { WaterDatasetArtifact } from './water-manifest'

export interface AwareCountryRecord {
  scarcity_factor_annual: number | null
  scarcity_factor_monthly: Record<string, number>
  source: 'aware_2_0'
  dataset_version: string
  confidence: number
}

export async function normalizeAwareByCountry(
  artifact: WaterDatasetArtifact
): Promise<Record<string, AwareCountryRecord>> {
  const workbook = XLSX.readFile(artifact.file_path)
  const worksheet = workbook.Sheets.CFs_nonagri
  if (!worksheet) {
    throw new Error('AWARE workbook is missing the CFs_nonagri worksheet.')
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: null,
  })
  if (rows.length === 0) {
    throw new Error('AWARE CFs_nonagri worksheet did not contain any rows.')
  }

  const requiredFields = ['GLAM_ISO3', 'Annual', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  for (const field of requiredFields) {
    if (!(field in rows[0]!)) {
      throw new Error(`AWARE CFs_nonagri worksheet is missing required field ${field}.`)
    }
  }

  const normalized: Record<string, AwareCountryRecord> = {}
  for (const row of rows) {
    const iso3 = String(row.GLAM_ISO3 ?? '').trim().toUpperCase()
    if (!iso3) continue

    const monthly: Record<string, number> = {}
    const months: Array<[string, string]> = [
      ['01', 'Jan'],
      ['02', 'Feb'],
      ['03', 'Mar'],
      ['04', 'Apr'],
      ['05', 'May'],
      ['06', 'Jun'],
      ['07', 'Jul'],
      ['08', 'Aug'],
      ['09', 'Sep'],
      ['10', 'Oct'],
      ['11', 'Nov'],
      ['12', 'Dec'],
    ]

    for (const [monthKey, columnName] of months) {
      const value = toNumber(row[columnName])
      if (value != null) {
        monthly[monthKey] = round4(value)
      }
    }

    normalized[iso3] = {
      scarcity_factor_annual: nullableRound4(toNumber(row.Annual)),
      scarcity_factor_monthly: monthly,
      source: 'aware_2_0',
      dataset_version: artifact.dataset_version,
      confidence: 0.87,
    }
  }

  return normalized
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const numericValue = Number(value)
    return Number.isFinite(numericValue) ? numericValue : null
  }

  return null
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000
}

function nullableRound4(value: number | null) {
  return value == null ? null : round4(value)
}
