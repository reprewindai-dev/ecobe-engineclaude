import AdmZip from 'adm-zip'
import * as XLSX from 'xlsx'

import { readJsonFile, type WaterDatasetArtifact } from './water-manifest'

export async function validateWaterDatasets(artifacts: WaterDatasetArtifact[]) {
  const summaries: Array<{ dataset: string; valid: boolean; checks: string[] }> = []

  for (const artifact of artifacts) {
    if (artifact.name === 'aqueduct') {
      summaries.push(await validateAqueduct(artifact))
    } else if (artifact.name === 'aware') {
      summaries.push(await validateAware(artifact))
    } else if (artifact.name === 'nrel') {
      summaries.push(await validateNrel(artifact))
    }
  }

  return {
    valid: summaries.every((summary) => summary.valid),
    summaries,
  }
}

async function validateAqueduct(artifact: WaterDatasetArtifact) {
  const zip = new AdmZip(artifact.file_path)
  const entry =
    zip
      .getEntries()
      .find((candidate: AdmZip.IZipEntry) =>
        candidate.entryName.toLowerCase().includes('baseline_annual') &&
        candidate.entryName.toLowerCase().endsWith('.csv')
      ) ?? null

  if (!entry) {
    throw new Error('Aqueduct archive is missing the baseline annual CSV.')
  }

  const lines = zip
    .readAsText(entry)
    .split(/\r?\n/)
    .filter((line: string) => line.trim().length > 0)
  const [headerLine, ...dataLines] = lines
  if (!headerLine || dataLines.length === 0) {
    throw new Error('Aqueduct baseline annual CSV did not include both a header and a sample row.')
  }

  const headers = parseCsvLine(headerLine)
  const checks = ['baseline annual CSV present']
  for (const field of ['gid_0', 'bws_raw', 'bws_score', 'drr_score', 'w_awr_def_qal_score', 'w_awr_def_tot_score']) {
    if (!headers.includes(field)) {
      throw new Error(`Aqueduct CSV validation failed: missing ${field}.`)
    }
  }
  checks.push('required fields present')

  const bwsScoreIndex = headers.indexOf('bws_score')
  const droughtRiskIndex = headers.indexOf('drr_score')
  const sample = dataLines
    .map(parseCsvLine)
    .find((values) => {
      const bwsScore = Number(values[bwsScoreIndex])
      const droughtRisk = Number(values[droughtRiskIndex])
      return (
        Number.isFinite(bwsScore) &&
        bwsScore >= 0 &&
        bwsScore <= 5 &&
        Number.isFinite(droughtRisk) &&
        droughtRisk >= 0 &&
        droughtRisk <= 5
      )
    })

  if (!sample) {
    throw new Error('Aqueduct CSV validation failed: no sample row contained valid stress and drought scores.')
  }

  const bwsScore = Number(sample[bwsScoreIndex])
  const droughtRisk = Number(sample[droughtRiskIndex])
  if (!Number.isFinite(bwsScore) || bwsScore < 0 || bwsScore > 5) {
    throw new Error('Aqueduct CSV validation failed: bws_score sample is out of range.')
  }
  if (!Number.isFinite(droughtRisk) || droughtRisk < 0 || droughtRisk > 5) {
    throw new Error('Aqueduct CSV validation failed: drr_score sample is out of range.')
  }
  checks.push('numeric sample values in expected range')

  return {
    dataset: artifact.name,
    valid: true,
    checks,
  }
}

async function validateAware(artifact: WaterDatasetArtifact) {
  const workbook = XLSX.readFile(artifact.file_path)
  const worksheet = workbook.Sheets.CFs_nonagri
  if (!worksheet) {
    throw new Error('AWARE workbook validation failed: CFs_nonagri worksheet not found.')
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: null })
  if (rows.length === 0) {
    throw new Error('AWARE workbook validation failed: CFs_nonagri worksheet is empty.')
  }

  const checks = ['CFs_nonagri worksheet present']
  for (const field of ['GLAM_ISO3', 'Annual', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']) {
    if (!(field in rows[0]!)) {
      throw new Error(`AWARE workbook validation failed: missing ${field}.`)
    }
  }
  checks.push('required monthly and annual columns present')

  const annualValue = Number(rows[0]!.Annual)
  if (!Number.isFinite(annualValue)) {
    throw new Error('AWARE workbook validation failed: Annual factor is not numeric in the sample row.')
  }
  checks.push('sample annual factor is numeric')

  return {
    dataset: artifact.name,
    valid: true,
    checks,
  }
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

async function validateNrel(artifact: WaterDatasetArtifact) {
  const nrel = await readJsonFile<{
    factors: Record<string, { median_gal_per_mwh: number }>
  }>(artifact.file_path)
  const checks = ['local seeded factor table present']

  for (const factorKey of [
    'wind_onshore',
    'solar_pv_operational',
    'ngcc_closed_loop',
    'coal_closed_loop',
    'nuclear_closed_loop',
  ]) {
    const factor = nrel.factors?.[factorKey]
    if (!factor || !Number.isFinite(factor.median_gal_per_mwh)) {
      throw new Error(`NREL factor validation failed: ${factorKey} is missing or non-numeric.`)
    }
  }
  checks.push('required factor rows present and numeric')

  return {
    dataset: artifact.name,
    valid: true,
    checks,
  }
}
