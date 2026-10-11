import { createHash, generateKeyPairSync, sign as signBytes } from 'crypto'

import { jcsCanonicalize } from '../lib/proof/jcs'
import {
  createDecisionReceiptSigner,
  issueDecisionReceipt,
  parseEd25519PrivateKey,
  signDecisionReceipt,
  toDecisionReceiptRecord,
  type DecisionReceiptInput,
  type DecisionReceiptSigner,
} from '../lib/proof/decision-receipt'
import {
  deriveReceiptKeyId,
  hashReceiptPayload,
  verifyDecisionReceipt,
  type DecisionReceiptEnvelope,
} from '../lib/proof/receipt-verifier'

function newSigner(): { signer: DecisionReceiptSigner; pkcs8: Buffer } {
  const { privateKey } = generateKeyPairSync('ed25519')
  return {
    signer: createDecisionReceiptSigner(privateKey),
    pkcs8: privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer,
  }
}

function trusted(signer: DecisionReceiptSigner) {
  return { [signer.keyId]: signer.publicKey }
}

function tracePayload(decisionFrameId = 'frame-paris-001') {
  return {
    identity: {
      traceId: 'trace-1',
      decisionFrameId,
      requestId: 'req-1',
      createdAt: '2026-10-11T03:00:00.000Z',
      sequenceNumber: 42,
    },
    decisionPath: {
      selectedRegion: 'eu-west-2',
      // Present in memory, dropped by JSON storage: the binding must survive that.
      rerouteFrom: undefined,
      rejectedRegions: [{ region: 'eu-west-3', reasonCodes: ['WATER_FALLBACK_CONSERVATIVE'] }],
    },
    normalizedSignals: { candidates: [{ region: 'eu-west-2', score: 185.123456, carbonIntensity: 212 }] },
  }
}

function receiptInput(overrides: Partial<DecisionReceiptInput['response']> = {}): DecisionReceiptInput {
  return {
    nodeId: 'router-1',
    issuedAt: '2026-10-11T03:00:00.000Z',
    response: {
      decisionFrameId: 'frame-paris-001',
      decision: 'reroute',
      reasonCode: 'REROUTE_LOWER_CARBON',
      decisionMode: 'runtime_authorization',
      operatingMode: 'NORMAL',
      selectedRegion: 'eu-west-2',
      doctrineVersion: 'doctrine-v1',
      signalConfidence: 0.62,
      fallbackUsed: true,
      proofHash: 'a'.repeat(64),
      baseline: { region: 'eu-west-3' },
      decisionEnvelope: { requestId: 'req-1' },
      proofEnvelope: {
        signalLineage: {
          carbonProvider: 'watttime',
          waterAuthorityMode: 'fallback',
          disagreementPct: 14.5,
          providerSnapshotRefs: ['snap-1', 'snap-2'],
        },
      },
      ...overrides,
    },
    trace: {
      payload: tracePayload(),
      sequenceNumber: 42,
      traceHash: 'b'.repeat(64),
      previousTraceHash: 'c'.repeat(64),
      inputSignalHash: 'd'.repeat(64),
    },
  }
}

/** Simulates the receipt and trace being written to and read back from Postgres JSONB. */
function roundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

describe('RFC 8785 JSON canonicalization', () => {
  it('matches the RFC 8785 section 3.2.2 example output', () => {
    // Built from code points so no escape handling sits between the RFC text and the test.
    const input = {
      numbers: [333333333.33333329, 1e30, 4.5, 2e-3, 1e-27],
      string: `${String.fromCharCode(0x20ac)}$${String.fromCharCode(0x0f, 0x0a)}A'B${String.fromCharCode(0x22, 0x5c, 0x5c, 0x22)}/`,
      literals: [null, true, false],
    }
    const backslash = String.fromCharCode(0x5c)
    const quote = String.fromCharCode(0x22)
    const expectedString = [
      String.fromCharCode(0x20ac),
      '$',
      `${backslash}u000f`,
      `${backslash}n`,
      "A'B",
      `${backslash}${quote}`,
      `${backslash}${backslash}${backslash}${backslash}`,
      `${backslash}${quote}`,
      '/',
    ].join('')
    expect(jcsCanonicalize(input)).toBe(
      `{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"${expectedString}"}`,
    )
  })

  it('sorts properties by UTF-16 code units (RFC 8785 section 3.2.3)', () => {
    const input = {
      [String.fromCharCode(0x20ac)]: 'Euro Sign',
      [String.fromCharCode(0x0d)]: 'Carriage Return',
      [String.fromCharCode(0xfb33)]: 'Hebrew Letter Dalet With Dagesh',
      '1': 'One',
      [String.fromCodePoint(0x1f600)]: 'Emoji: Grinning Face',
      [String.fromCharCode(0x80)]: 'Control',
      [String.fromCharCode(0xf6)]: 'Latin Small Letter O With Diaeresis',
    }
    // Read the order from the canonical text: JS objects reorder integer-like keys.
    const order = [...jcsCanonicalize(input).matchAll(/":"([^"]+)"/g)].map((match) => match[1])
    expect(order).toEqual([
      'Carriage Return',
      'One',
      'Control',
      'Latin Small Letter O With Diaeresis',
      'Euro Sign',
      'Emoji: Grinning Face',
      'Hebrew Letter Dalet With Dagesh',
    ])
  })

  it('serializes -0 as 0 and omits undefined properties', () => {
    expect(jcsCanonicalize({ b: -0, a: undefined, c: [1, { z: 1, y: 2 }] })).toBe('{"b":0,"c":[1,{"y":2,"z":1}]}')
  })

  it.each([
    ['NaN', { value: Number.NaN }],
    ['Infinity', { value: Number.POSITIVE_INFINITY }],
    ['bigint', { value: BigInt(1) }],
    ['undefined in array', { value: [1, undefined] }],
  ])('rejects %s rather than guessing an encoding', (_label, input) => {
    expect(() => jcsCanonicalize(input)).toThrow()
  })
})

describe('VDB-C0 decision receipts', () => {
  it('produces a receipt an independent verifier accepts, including the trace binding', () => {
    const { signer } = newSigner()
    const envelope = signDecisionReceipt(receiptInput(), signer)

    const result = verifyDecisionReceipt(roundTrip(envelope), trusted(signer), {
      tracePayload: roundTrip(tracePayload()),
    })

    expect(result.verdict).toBe('VALID_NONCONSEQUENTIAL')
    expect(result.checks).toEqual(['structure', 'receipt_hash', 'trust_material', 'signature', 'trace_binding'])
    expect(result.decisionFrameId).toBe('frame-paris-001')
  })

  it('content-addresses the payload with plain SHA-256 over JCS bytes', () => {
    const { signer } = newSigner()
    const envelope = signDecisionReceipt(receiptInput(), signer)
    const independent = `sha256:${createHash('sha256').update(jcsCanonicalize(envelope.payload)).digest('hex')}`
    expect(envelope.receipt_hash).toBe(independent)
  })

  it('signs the evidence posture, so fallback and disagreement cannot be silently dropped', () => {
    const { signer } = newSigner()
    const envelope = signDecisionReceipt(receiptInput(), signer)
    expect(envelope.payload.evidence).toEqual({
      signal_confidence: 0.62,
      fallback_used: true,
      carbon_provider: 'watttime',
      water_authority_mode: 'fallback',
      disagreement_pct: 14.5,
      provider_snapshot_refs: ['snap-1', 'snap-2'],
    })

    const laundered = roundTrip(envelope)
    laundered.payload.evidence.fallback_used = false
    expect(verifyDecisionReceipt(laundered, trusted(signer)).verdict).toBe('REJECTED_TAMPERED')
  })

  it('rejects a payload edit as tampering (F-4)', () => {
    const { signer } = newSigner()
    const envelope = roundTrip(signDecisionReceipt(receiptInput(), signer))
    envelope.payload.decision.selected_region = 'eu-west-3'

    const result = verifyDecisionReceipt(envelope, trusted(signer))
    expect(result.verdict).toBe('REJECTED_TAMPERED')
    expect(result.failedRule).toBe('F-4')
    expect(result.failedObject).toBe('payload')
  })

  it('rejects an edit whose receipt_hash was recomputed, because the signature no longer matches', () => {
    const { signer } = newSigner()
    const envelope = roundTrip(signDecisionReceipt(receiptInput(), signer))
    envelope.payload.decision.action = 'run_now'
    envelope.receipt_hash = hashReceiptPayload(envelope.payload)

    expect(verifyDecisionReceipt(envelope, trusted(signer)).verdict).toBe('REJECTED_UNAUTHORIZED')
  })

  it('rejects a signature over the bare digest (no domain separation) from the same key', () => {
    const { privateKey } = generateKeyPairSync('ed25519')
    const signer = createDecisionReceiptSigner(privateKey)
    const envelope = roundTrip(signDecisionReceipt(receiptInput(), signer))
    const bareDigest = Buffer.from(envelope.receipt_hash.replace('sha256:', ''), 'hex')
    envelope.signature.value = signBytes(null, bareDigest, privateKey).toString('base64url')

    expect(verifyDecisionReceipt(envelope, trusted(signer)).verdict).toBe('REJECTED_UNAUTHORIZED')
  })

  it('rejects swapping the envelope key id to another trusted key', () => {
    const { signer } = newSigner()
    const { signer: other } = newSigner()
    const envelope = roundTrip(signDecisionReceipt(receiptInput(), signer))
    envelope.signature.key_id = other.keyId

    const result = verifyDecisionReceipt(envelope, { ...trusted(signer), ...trusted(other) })
    expect(result.verdict).toBe('REJECTED_UNAUTHORIZED')
    expect(result.failedObject).toBe('signature.key_id')
  })

  it('is indeterminate, not valid, when the verifier lacks the signing key', () => {
    const { signer } = newSigner()
    const { signer: other } = newSigner()
    const envelope = signDecisionReceipt(receiptInput(), signer)

    expect(verifyDecisionReceipt(envelope, trusted(other)).verdict).toBe('INDETERMINATE_MISSING_TRUST_MATERIAL')
  })

  it('refuses trust material registered under a key id it does not hash to', () => {
    const { signer } = newSigner()
    const { signer: other } = newSigner()
    const envelope = signDecisionReceipt(receiptInput(), signer)

    const result = verifyDecisionReceipt(envelope, { [signer.keyId]: other.publicKey })
    expect(result.verdict).toBe('INDETERMINATE_MISSING_TRUST_MATERIAL')
  })

  it('detects a stored trace edited after signing (F-4)', () => {
    const { signer } = newSigner()
    const envelope = signDecisionReceipt(receiptInput(), signer)
    const edited = roundTrip(tracePayload())
    edited.decisionPath.rejectedRegions = []

    const result = verifyDecisionReceipt(envelope, trusted(signer), { tracePayload: edited })
    expect(result.verdict).toBe('REJECTED_TAMPERED')
    expect(result.failedObject).toBe('tracePayload')
  })

  it('detects a trace spliced in from another decision frame', () => {
    const { signer } = newSigner()
    const envelope = signDecisionReceipt(receiptInput(), signer)

    const result = verifyDecisionReceipt(envelope, trusted(signer), {
      tracePayload: tracePayload('frame-other-002'),
    })
    expect(result.verdict).toBe('REJECTED_TAMPERED')
  })

  it.each([
    ['not an object', 'garbage'],
    ['unknown protocol', { protocol: 'other', receipt_hash: 'x', payload: {}, signature: {} }],
  ])('reports %s as an incomplete bundle', (_label, envelope) => {
    const { signer } = newSigner()
    expect(verifyDecisionReceipt(envelope, trusted(signer)).verdict).toBe('REJECTED_INCOMPLETE_BUNDLE')
  })

  it('reports an unsupported signature algorithm as an incomplete bundle', () => {
    const { signer } = newSigner()
    const envelope = roundTrip(signDecisionReceipt(receiptInput(), signer)) as unknown as {
      signature: { alg: string }
    }
    envelope.signature.alg = 'HS256'
    expect(verifyDecisionReceipt(envelope, trusted(signer)).verdict).toBe('REJECTED_INCOMPLETE_BUNDLE')
  })
})

describe('decision receipt signing keys', () => {
  it('derives the same key id from PEM, base64 PKCS#8, and raw seed forms', () => {
    const { privateKey } = generateKeyPairSync('ed25519')
    const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()
    const der = privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer
    const seed = der.subarray(der.length - 32)

    const ids = [pem, pem.replace(/\n/g, '\\n'), der.toString('base64'), seed.toString('base64url')].map(
      (material) => createDecisionReceiptSigner(parseEd25519PrivateKey(material)).keyId,
    )
    expect(new Set(ids).size).toBe(1)
    expect(ids[0]).toMatch(/^ed25519:[0-9a-f]{32}$/)
    expect(ids[0]).toBe(deriveReceiptKeyId(createDecisionReceiptSigner(privateKey).publicKey))
  })

  it('rejects non-Ed25519 and unreadable keys', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 })
    expect(() => parseEd25519PrivateKey(privateKey.export({ format: 'pem', type: 'pkcs8' }).toString())).toThrow(
      /must be Ed25519/,
    )
    expect(() => parseEd25519PrivateKey('not-a-key')).toThrow(/not a readable private key/)
  })
})

describe('issueDecisionReceipt', () => {
  it('stores a verifiable receipt when a signing key is configured', async () => {
    const { signer } = newSigner()
    const create = jest.fn().mockResolvedValue({})

    const result = await issueDecisionReceipt({ decisionReceipt: { create } }, receiptInput(), () => signer)

    expect(result.status).toBe('issued')
    const record = create.mock.calls[0][0].data as ReturnType<typeof toDecisionReceiptRecord>
    expect(record.decisionFrameId).toBe('frame-paris-001')
    expect(record.alg).toBe('Ed25519')
    expect(record.keyId).toBe(signer.keyId)
    expect(record.traceHash).toBe('b'.repeat(64))
    const stored = roundTrip(record.envelope) as unknown as DecisionReceiptEnvelope
    expect(record.receiptHash).toBe(stored.receipt_hash)
    expect(verifyDecisionReceipt(stored, trusted(signer)).verdict).toBe('VALID_NONCONSEQUENTIAL')
  })

  it('issues nothing, and writes nothing, when no key is configured', async () => {
    const create = jest.fn()
    const result = await issueDecisionReceipt({ decisionReceipt: { create } }, receiptInput(), () => null)

    expect(result).toEqual({ status: 'not_configured' })
    expect(create).not.toHaveBeenCalled()
  })

  it('never throws into the routing path when storage or key loading fails', async () => {
    const { signer } = newSigner()
    const failingStore = { decisionReceipt: { create: jest.fn().mockRejectedValue(new Error('relation does not exist')) } }
    await expect(issueDecisionReceipt(failingStore, receiptInput(), () => signer)).resolves.toEqual({
      status: 'failed',
      error: 'relation does not exist',
    })

    const badKey = () => createDecisionReceiptSigner(parseEd25519PrivateKey('not-a-key'))
    const result = await issueDecisionReceipt({ decisionReceipt: { create: jest.fn() } }, receiptInput(), badKey)
    expect(result.status).toBe('failed')
  })
})
