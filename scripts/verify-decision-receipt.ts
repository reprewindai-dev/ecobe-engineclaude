/**
 * Offline verifier for VDB-C0 decision receipts. Needs no engine, database, or
 * network access.
 *
 *   tsx scripts/verify-decision-receipt.ts --receipt receipt.json --keys keys.json [--trace trace.json]
 *
 * --receipt  output of GET /api/v1/ci/decisions/:id/receipt, or a bare envelope
 * --keys     output of GET /api/v1/ci/receipts/keys, or a PEM public key file
 * --trace    output of GET /api/v1/ci/decisions/:id/trace/raw, or a bare trace payload
 *
 * Exit code 0 only for VALID_NONCONSEQUENTIAL.
 */
import fs from 'fs'

import {
  deriveReceiptKeyId,
  verifyDecisionReceipt,
  type TrustedPublicKeys,
} from '../src/lib/proof/receipt-verifier'

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function readJson(path: string): any {
  return JSON.parse(fs.readFileSync(path, 'utf8'))
}

function loadTrustedKeys(path: string): TrustedPublicKeys {
  const text = fs.readFileSync(path, 'utf8')
  if (text.trim().startsWith('-----BEGIN')) {
    return { [deriveReceiptKeyId(text)]: text }
  }
  const parsed = JSON.parse(text)
  const keys: Array<{ publicKeyPem?: string; publicKeyRaw?: string }> = Array.isArray(parsed)
    ? parsed
    : parsed.keys ?? []
  const trusted: TrustedPublicKeys = {}
  for (const key of keys) {
    const material = key.publicKeyPem ?? key.publicKeyRaw
    // Key ids are recomputed from the key bytes, never taken from the file.
    if (material) trusted[deriveReceiptKeyId(material)] = material
  }
  return trusted
}

const receiptPath = arg('receipt')
const keysPath = arg('keys')
if (!receiptPath || !keysPath) {
  console.error('Usage: verify-decision-receipt --receipt <file> --keys <file> [--trace <file>]')
  process.exit(2)
}

const receiptDoc = readJson(receiptPath)
const envelope = receiptDoc.receipt ?? receiptDoc
const tracePath = arg('trace')
const traceDoc = tracePath ? readJson(tracePath) : undefined
const tracePayload = traceDoc ? traceDoc.payload ?? traceDoc : undefined

const verification = verifyDecisionReceipt(
  envelope,
  loadTrustedKeys(keysPath),
  tracePayload !== undefined ? { tracePayload } : undefined,
)
console.log(JSON.stringify(verification, null, 2))
process.exit(verification.verdict === 'VALID_NONCONSEQUENTIAL' ? 0 : 1)
