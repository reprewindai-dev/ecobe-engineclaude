import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const EXPORT_DIR = path.resolve(process.cwd(), 'data', 'exports', 'ci')
const EXPORT_INDEX = path.join(EXPORT_DIR, 'index.json')

export interface ExportBatchMerkleMetadata {
  version: string
  algorithm: string
  root: string
  leafCount: number
}

interface ExportIndexEntry {
  batchId: string
  batchHash: string
  previousBatchHash: string | null
  createdAt: string
  path: string
  merkleRoot?: string | null
}

export interface ExportBatchEnvelope {
  batchId: string
  previousBatchHash: string | null
  batchHash: string
  createdAt: string
  merkle?: ExportBatchMerkleMetadata | null
  payload: unknown
}

interface ExportIndexFile {
  entries: ExportIndexEntry[]
}

function ensureExportDir() {
  if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true })
  }
}

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(',')}]`
  }
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(record[k])}`).join(',')}}`
}

export function sha256Canonical(value: unknown): string {
  return crypto.createHash('sha256').update(canonicalStringify(value)).digest('hex')
}

function readIndex(): ExportIndexFile {
  ensureExportDir()
  if (!fs.existsSync(EXPORT_INDEX)) {
    return { entries: [] }
  }
  try {
    const raw = fs.readFileSync(EXPORT_INDEX, 'utf8')
    const parsed = JSON.parse(raw) as ExportIndexFile
    if (!Array.isArray(parsed.entries)) {
      return { entries: [] }
    }
    return parsed
  } catch {
    return { entries: [] }
  }
}

function writeIndex(index: ExportIndexFile) {
  ensureExportDir()
  fs.writeFileSync(EXPORT_INDEX, JSON.stringify(index, null, 2))
}

export function persistExportBatch(
  batchId: string,
  payload: unknown,
  merkle?: ExportBatchMerkleMetadata | null,
): {
  batchPath: string
  batchHash: string
  previousBatchHash: string | null
  chainPosition: number
  merkleRoot: string | null
} {
  ensureExportDir()
  const index = readIndex()
  const previousBatchHash = index.entries.length > 0 ? index.entries[index.entries.length - 1].batchHash : null
  const batchHash = sha256Canonical({ previousBatchHash, payload, merkleRoot: merkle?.root ?? null })
  const fileName = `${batchId}.json`
  const batchPath = path.join(EXPORT_DIR, fileName)

  const exportEnvelope: ExportBatchEnvelope = {
    batchId,
    previousBatchHash,
    batchHash,
    createdAt: new Date().toISOString(),
    merkle: merkle ?? null,
    payload,
  }

  fs.writeFileSync(batchPath, JSON.stringify(exportEnvelope, null, 2))

  index.entries.push({
    batchId,
    batchHash,
    previousBatchHash,
    createdAt: exportEnvelope.createdAt,
    path: batchPath,
    merkleRoot: merkle?.root ?? null,
  })
  writeIndex(index)

  return {
    batchPath,
    batchHash,
    previousBatchHash,
    chainPosition: index.entries.length,
    merkleRoot: merkle?.root ?? null,
  }
}

export function readExportBatch(batchId: string): ExportBatchEnvelope | null {
  const entry = readIndex().entries.find((candidate) => candidate.batchId === batchId)
  if (!entry) {
    return null
  }
  try {
    return JSON.parse(fs.readFileSync(entry.path, 'utf8')) as ExportBatchEnvelope
  } catch {
    return null
  }
}

export function readExportChainHead(): ExportIndexEntry | null {
  const index = readIndex()
  return index.entries.length > 0 ? index.entries[index.entries.length - 1] : null
}

