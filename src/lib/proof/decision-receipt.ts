/**
 * VDB-C0 signed decision receipts.
 *
 * A receipt binds one routing decision (decision frame) to:
 *   - the content address of the stored decision trace (RFC 8785 JCS + SHA-256),
 *   - the existing trace hash chain and proof hash,
 *   - the evidence posture the decision was made under (fallback, confidence,
 *     provider disagreement, water authority mode),
 * and is signed with an asymmetric Ed25519 key so that any party holding the
 * public key can verify it offline with `receipt-verifier.ts`.
 *
 * A receipt attests what the engine decided and on what evidence. It does not
 * attest that the workload ran where it was routed (no consequence finality).
 */
import { createPrivateKey, createPublicKey, sign as signBytes, type KeyObject } from 'crypto'

import { env } from '../../config/env'
import {
  DECISION_RECEIPT_CONFORMANCE,
  DECISION_RECEIPT_ENVELOPE_PROTOCOL,
  DECISION_RECEIPT_PROTOCOL,
  LEGACY_HASH_CANONICALIZATION,
  deriveReceiptKeyId,
  hashJsonDocument,
  hashReceiptPayload,
  rawEd25519PublicKey,
  receiptSigningMessage,
  type DecisionReceiptEnvelope,
  type DecisionReceiptPayload,
} from './receipt-verifier'

const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex')

export interface DecisionReceiptSigner {
  readonly keyId: string
  readonly publicKey: KeyObject
  sign(message: Buffer): string
}

export class DecisionReceiptKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DecisionReceiptKeyError'
  }
}

/**
 * Accepts a PKCS#8 PEM, base64 PKCS#8 DER, or a base64/base64url raw 32-byte
 * Ed25519 seed. Anything else is rejected rather than guessed at.
 */
export function parseEd25519PrivateKey(material: string): KeyObject {
  const trimmed = material.trim()
  let key: KeyObject
  try {
    if (trimmed.startsWith('-----BEGIN')) {
      key = createPrivateKey(trimmed.replace(/\\n/g, '\n'))
    } else {
      const der = Buffer.from(trimmed.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
      const pkcs8 = der.length === 32 ? Buffer.concat([ED25519_PKCS8_PREFIX, der]) : der
      key = createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' })
    }
  } catch (error) {
    throw new DecisionReceiptKeyError(
      `DECISION_RECEIPT_SIGNING_KEY is not a readable private key: ${(error as Error).message}`,
    )
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new DecisionReceiptKeyError(
      `DECISION_RECEIPT_SIGNING_KEY must be Ed25519, got ${String(key.asymmetricKeyType)}`,
    )
  }
  return key
}

export function createDecisionReceiptSigner(privateKey: KeyObject): DecisionReceiptSigner {
  const publicKey = createPublicKey(privateKey)
  return {
    keyId: deriveReceiptKeyId(publicKey),
    publicKey,
    sign(message: Buffer) {
      return signBytes(null, message, privateKey).toString('base64url')
    },
  }
}

let cachedSigner: { material: string; signer: DecisionReceiptSigner } | null = null

/** Returns null when no signing key is configured; receipts are then not issued. */
export function getDecisionReceiptSigner(
  material: string | undefined = env.DECISION_RECEIPT_SIGNING_KEY,
): DecisionReceiptSigner | null {
  if (!material) return null
  if (cachedSigner?.material === material) return cachedSigner.signer
  const signer = createDecisionReceiptSigner(parseEd25519PrivateKey(material))
  cachedSigner = { material, signer }
  return signer
}

export function describeReceiptPublicKey(signer: DecisionReceiptSigner) {
  return {
    keyId: signer.keyId,
    alg: 'Ed25519' as const,
    publicKeyPem: signer.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
    publicKeyRaw: rawEd25519PublicKey(signer.publicKey).toString('base64url'),
  }
}

/** Mirrors what Prisma persists for a Json column, so the hash matches the stored trace. */
function toStoredJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value))
}

export interface DecisionReceiptInput {
  nodeId: string
  issuedAt: string
  response: {
    decisionFrameId: string
    decision: string
    reasonCode: string
    decisionMode: string
    operatingMode: string
    selectedRegion: string
    doctrineVersion: string
    signalConfidence: number
    fallbackUsed: boolean
    proofHash: string
    baseline: { region: string }
    decisionEnvelope: { requestId: string }
    proofEnvelope: {
      signalLineage: {
        carbonProvider: string
        waterAuthorityMode: string
        disagreementPct: number
        providerSnapshotRefs: string[]
      }
    }
  }
  trace: {
    payload: unknown
    sequenceNumber: number
    traceHash: string
    previousTraceHash: string | null
    inputSignalHash: string
  }
}

export function buildDecisionReceiptPayload(
  input: DecisionReceiptInput,
  keyId: string,
): DecisionReceiptPayload {
  const { response, trace } = input
  const lineage = response.proofEnvelope.signalLineage
  return {
    protocol: DECISION_RECEIPT_PROTOCOL,
    conformance: DECISION_RECEIPT_CONFORMANCE,
    canonicalization: 'rfc8785-jcs',
    hash_algorithm: 'sha-256',
    decision_frame_id: response.decisionFrameId,
    request_id: response.decisionEnvelope.requestId,
    issued_at: new Date(input.issuedAt).toISOString(),
    issuer: {
      node_id: input.nodeId,
      key_id: keyId,
    },
    decision: {
      action: response.decision,
      reason_code: response.reasonCode,
      decision_mode: response.decisionMode,
      operating_mode: response.operatingMode,
      selected_region: response.selectedRegion,
      baseline_region: response.baseline.region,
      doctrine_version: response.doctrineVersion,
    },
    evidence: {
      signal_confidence: response.signalConfidence,
      fallback_used: response.fallbackUsed,
      carbon_provider: lineage.carbonProvider,
      water_authority_mode: lineage.waterAuthorityMode,
      disagreement_pct: lineage.disagreementPct,
      provider_snapshot_refs: [...lineage.providerSnapshotRefs],
    },
    bindings: {
      trace_payload_sha256: hashJsonDocument(toStoredJson(trace.payload)),
      trace_sequence_number: trace.sequenceNumber,
      trace_hash: trace.traceHash,
      previous_trace_hash: trace.previousTraceHash,
      input_signal_hash: trace.inputSignalHash,
      proof_hash: response.proofHash,
      legacy_hash_canonicalization: LEGACY_HASH_CANONICALIZATION,
    },
  }
}

export function signDecisionReceipt(
  input: DecisionReceiptInput,
  signer: DecisionReceiptSigner,
): DecisionReceiptEnvelope {
  const payload = buildDecisionReceiptPayload(input, signer.keyId)
  const receiptHash = hashReceiptPayload(payload)
  return {
    protocol: DECISION_RECEIPT_ENVELOPE_PROTOCOL,
    receipt_hash: receiptHash,
    payload,
    signature: {
      alg: 'Ed25519',
      key_id: signer.keyId,
      value: signer.sign(receiptSigningMessage(receiptHash)),
    },
  }
}

export function toDecisionReceiptRecord(envelope: DecisionReceiptEnvelope) {
  return {
    decisionFrameId: envelope.payload.decision_frame_id,
    receiptHash: envelope.receipt_hash,
    keyId: envelope.signature.key_id,
    alg: envelope.signature.alg,
    signature: envelope.signature.value,
    traceHash: envelope.payload.bindings.trace_hash,
    envelope: envelope as unknown as Record<string, unknown>,
  }
}

export type DecisionReceiptIssueResult =
  | { status: 'issued'; receiptHash: string; keyId: string }
  | { status: 'not_configured' }
  | { status: 'failed'; error: string }

interface DecisionReceiptStore {
  decisionReceipt: {
    create(args: { data: ReturnType<typeof toDecisionReceiptRecord> }): Promise<unknown>
  }
}

/**
 * Signs and stores the receipt after the decision has committed. Never throws:
 * like billing, receipt issuance must not block routing. A decision without a
 * receipt is visible as such (no row), never as a fabricated or unsigned one.
 */
export async function issueDecisionReceipt(
  store: DecisionReceiptStore,
  input: DecisionReceiptInput,
  resolveSigner: () => DecisionReceiptSigner | null = () => getDecisionReceiptSigner(),
): Promise<DecisionReceiptIssueResult> {
  try {
    const signer = resolveSigner()
    if (!signer) return { status: 'not_configured' }
    const envelope = signDecisionReceipt(input, signer)
    await store.decisionReceipt.create({ data: toDecisionReceiptRecord(envelope) })
    return { status: 'issued', receiptHash: envelope.receipt_hash, keyId: envelope.signature.key_id }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn('Failed to issue decision receipt', {
      decisionFrameId: input.response.decisionFrameId,
      error: message,
    })
    return { status: 'failed', error: message }
  }
}
