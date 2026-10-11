/**
 * Offline verifier for VDB-C0 decision receipts.
 *
 * Imports nothing from the engine (no env, no database, no network) so that a
 * party that did not produce the decision can verify it with only:
 *   - the receipt envelope,
 *   - a set of trusted Ed25519 public keys,
 *   - optionally, the stored decision trace payload the receipt binds to.
 */
import { createHash, createPublicKey, verify as verifySignature, type KeyObject } from 'crypto'

import { jcsCanonicalize } from './jcs'

export const DECISION_RECEIPT_PROTOCOL = 'veklom.decision-receipt.v1'
export const DECISION_RECEIPT_ENVELOPE_PROTOCOL = 'veklom.decision-receipt-envelope.v1'
export const DECISION_RECEIPT_CONFORMANCE = 'VDB-C0'
/**
 * Domain-separation tag. The signature covers `tag || 0x00 || sha256(JCS(payload))`,
 * so a signature made for another object type with the same key cannot be
 * replayed as a decision receipt. It is fixed by the protocol, never read from
 * the envelope.
 */
export const DECISION_RECEIPT_SIGNATURE_DOMAIN = 'veklom.decision-receipt.v1.signature'
/** Canonicalization used by the pre-existing trace/proof hashes (sorted-key JSON). */
export const LEGACY_HASH_CANONICALIZATION = 'ecobe-sorted-json.v0'

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

export interface DecisionReceiptPayload {
  protocol: typeof DECISION_RECEIPT_PROTOCOL
  conformance: typeof DECISION_RECEIPT_CONFORMANCE
  canonicalization: 'rfc8785-jcs'
  hash_algorithm: 'sha-256'
  decision_frame_id: string
  request_id: string
  issued_at: string
  issuer: {
    node_id: string
    key_id: string
  }
  decision: {
    action: string
    reason_code: string
    decision_mode: string
    operating_mode: string
    selected_region: string
    baseline_region: string
    doctrine_version: string
  }
  evidence: {
    signal_confidence: number
    fallback_used: boolean
    carbon_provider: string
    water_authority_mode: string
    disagreement_pct: number
    provider_snapshot_refs: string[]
  }
  bindings: {
    trace_payload_sha256: string
    trace_sequence_number: number
    trace_hash: string
    previous_trace_hash: string | null
    input_signal_hash: string
    proof_hash: string
    legacy_hash_canonicalization: typeof LEGACY_HASH_CANONICALIZATION
  }
}

export interface DecisionReceiptEnvelope {
  protocol: typeof DECISION_RECEIPT_ENVELOPE_PROTOCOL
  receipt_hash: string
  payload: DecisionReceiptPayload
  signature: {
    alg: 'Ed25519'
    key_id: string
    value: string
  }
}

export type ReceiptVerdict =
  | 'VALID_NONCONSEQUENTIAL'
  | 'REJECTED_TAMPERED'
  | 'REJECTED_UNAUTHORIZED'
  | 'REJECTED_INCOMPLETE_BUNDLE'
  | 'INDETERMINATE_MISSING_TRUST_MATERIAL'

export interface ReceiptVerification {
  protocol: 'veklom.bundle-verdict.v1'
  verdict: ReceiptVerdict
  receiptHash: string | null
  decisionFrameId: string | null
  keyId: string | null
  failedRule: string | null
  failedObject: string | null
  detail: string | null
  checks: string[]
}

export type TrustedPublicKeys = Record<string, KeyObject | string>

export function sha256Prefixed(bytes: string | Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

export function hashReceiptPayload(payload: unknown): string {
  return sha256Prefixed(jcsCanonicalize(payload))
}

/** Hash of a JSON document exactly as an independent JCS implementation would compute it. */
export function hashJsonDocument(document: unknown): string {
  return sha256Prefixed(jcsCanonicalize(document))
}

export function receiptSigningMessage(receiptHash: string): Buffer {
  const digest = Buffer.from(receiptHash.replace(/^sha256:/, ''), 'hex')
  return Buffer.concat([Buffer.from(DECISION_RECEIPT_SIGNATURE_DOMAIN, 'utf8'), Buffer.from([0]), digest])
}

export function toEd25519PublicKey(key: KeyObject | string): KeyObject {
  if (typeof key !== 'string') return key
  const trimmed = key.trim()
  if (trimmed.startsWith('-----BEGIN')) return createPublicKey(trimmed)
  const der = Buffer.from(trimmed.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  const spki = der.length === 32 ? Buffer.concat([ED25519_SPKI_PREFIX, der]) : der
  return createPublicKey({ key: spki, format: 'der', type: 'spki' })
}

export function rawEd25519PublicKey(key: KeyObject): Buffer {
  const spki = key.export({ format: 'der', type: 'spki' }) as Buffer
  return spki.subarray(spki.length - 32)
}

/** Key ids are derived from the key itself so trust material cannot be mislabelled. */
export function deriveReceiptKeyId(key: KeyObject | string): string {
  const raw = rawEd25519PublicKey(toEd25519PublicKey(key))
  return `ed25519:${createHash('sha256').update(raw).digest('hex').slice(0, 32)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

export function verifyDecisionReceipt(
  envelope: unknown,
  trustedKeys: TrustedPublicKeys,
  options?: { tracePayload?: unknown },
): ReceiptVerification {
  const checks: string[] = []
  const result = (
    verdict: ReceiptVerdict,
    extra: Partial<Omit<ReceiptVerification, 'protocol' | 'verdict' | 'checks'>> = {},
  ): ReceiptVerification => ({
    protocol: 'veklom.bundle-verdict.v1',
    verdict,
    receiptHash: isRecord(envelope) && typeof envelope.receipt_hash === 'string' ? envelope.receipt_hash : null,
    decisionFrameId:
      isRecord(envelope) && isRecord(envelope.payload) && typeof envelope.payload.decision_frame_id === 'string'
        ? envelope.payload.decision_frame_id
        : null,
    keyId:
      isRecord(envelope) && isRecord(envelope.signature) && typeof envelope.signature.key_id === 'string'
        ? envelope.signature.key_id
        : null,
    failedRule: null,
    failedObject: null,
    detail: null,
    ...extra,
    checks,
  })

  // 1. Structure
  if (
    !isRecord(envelope) ||
    envelope.protocol !== DECISION_RECEIPT_ENVELOPE_PROTOCOL ||
    typeof envelope.receipt_hash !== 'string' ||
    !isRecord(envelope.payload) ||
    !isRecord(envelope.signature) ||
    typeof envelope.signature.key_id !== 'string' ||
    typeof envelope.signature.value !== 'string'
  ) {
    return result('REJECTED_INCOMPLETE_BUNDLE', {
      failedRule: 'F-10',
      failedObject: 'DecisionReceiptEnvelope',
      detail: 'Envelope is missing required fields or has an unknown protocol',
    })
  }
  const payload = envelope.payload
  const signature = envelope.signature
  const keyId: string = envelope.signature.key_id
  const signatureValue: string = envelope.signature.value
  if (signature.alg !== 'Ed25519') {
    return result('REJECTED_INCOMPLETE_BUNDLE', {
      failedRule: 'F-10',
      failedObject: 'signature.alg',
      detail: `Unsupported signature algorithm: ${String(signature.alg)}`,
    })
  }
  if (
    payload.protocol !== DECISION_RECEIPT_PROTOCOL ||
    payload.canonicalization !== 'rfc8785-jcs' ||
    payload.hash_algorithm !== 'sha-256' ||
    !isRecord(payload.issuer) ||
    !isRecord(payload.bindings)
  ) {
    return result('REJECTED_INCOMPLETE_BUNDLE', {
      failedRule: 'F-10',
      failedObject: 'payload',
      detail: 'Payload protocol, canonicalization, or hash algorithm is not supported',
    })
  }
  checks.push('structure')

  // 2. Content address
  let computedHash: string
  try {
    computedHash = hashReceiptPayload(payload)
  } catch (error) {
    return result('REJECTED_INCOMPLETE_BUNDLE', {
      failedRule: 'F-10',
      failedObject: 'payload',
      detail: `Payload cannot be canonicalized: ${(error as Error).message}`,
    })
  }
  if (computedHash !== envelope.receipt_hash) {
    return result('REJECTED_TAMPERED', {
      failedRule: 'F-4',
      failedObject: 'payload',
      detail: `Recomputed ${computedHash} does not match receipt_hash`,
    })
  }
  checks.push('receipt_hash')

  // 3. The signing key named outside the signed bytes must match the one inside them.
  if (payload.issuer.key_id !== keyId) {
    return result('REJECTED_UNAUTHORIZED', {
      failedRule: 'A',
      failedObject: 'signature.key_id',
      detail: 'Envelope key id differs from the signed issuer key id',
    })
  }

  // 4. Trust material
  const trusted = trustedKeys[keyId]
  if (!trusted) {
    return result('INDETERMINATE_MISSING_TRUST_MATERIAL', {
      failedRule: 'F-10',
      failedObject: 'trustedKeys',
      detail: `No trusted public key for ${keyId}`,
    })
  }
  let publicKey: KeyObject
  try {
    publicKey = toEd25519PublicKey(trusted)
  } catch (error) {
    return result('INDETERMINATE_MISSING_TRUST_MATERIAL', {
      failedRule: 'F-10',
      failedObject: 'trustedKeys',
      detail: `Trusted key cannot be parsed: ${(error as Error).message}`,
    })
  }
  if (deriveReceiptKeyId(publicKey) !== keyId) {
    return result('INDETERMINATE_MISSING_TRUST_MATERIAL', {
      failedRule: 'F-10',
      failedObject: 'trustedKeys',
      detail: 'Trusted key does not hash to the key id it is registered under',
    })
  }
  checks.push('trust_material')

  // 5. Signature
  let signatureValid = false
  try {
    signatureValid = verifySignature(
      null,
      receiptSigningMessage(computedHash),
      publicKey,
      base64UrlDecode(signatureValue),
    )
  } catch {
    signatureValid = false
  }
  if (!signatureValid) {
    return result('REJECTED_UNAUTHORIZED', {
      failedRule: 'A',
      failedObject: 'signature.value',
      detail: 'Ed25519 signature does not verify for this receipt',
    })
  }
  checks.push('signature')

  // 6. Optional binding to the stored decision trace
  if (options?.tracePayload !== undefined) {
    const trace = options.tracePayload
    const traceIdentity = isRecord(trace) && isRecord(trace.identity) ? trace.identity : null
    if (traceIdentity?.decisionFrameId !== payload.decision_frame_id) {
      return result('REJECTED_TAMPERED', {
        failedRule: 'F-4',
        failedObject: 'tracePayload',
        detail: 'Trace payload belongs to a different decision frame',
      })
    }
    let traceHash: string
    try {
      traceHash = hashJsonDocument(trace)
    } catch (error) {
      return result('REJECTED_INCOMPLETE_BUNDLE', {
        failedRule: 'F-10',
        failedObject: 'tracePayload',
        detail: `Trace payload cannot be canonicalized: ${(error as Error).message}`,
      })
    }
    if (traceHash !== payload.bindings.trace_payload_sha256) {
      return result('REJECTED_TAMPERED', {
        failedRule: 'F-4',
        failedObject: 'tracePayload',
        detail: `Trace payload hashes to ${traceHash}, receipt binds ${String(payload.bindings.trace_payload_sha256)}`,
      })
    }
    checks.push('trace_binding')
  }

  return result('VALID_NONCONSEQUENTIAL')
}
