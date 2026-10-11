# Decision Receipts (VDB-C0)

Every persisted CO₂ Router decision can carry a **signed decision receipt**: an
Ed25519 signature over an RFC 8785 (JCS) canonical payload that binds the
decision to its stored trace envelope and to the evidence posture it was made
under. A party that did not run the engine can verify it offline.

A receipt attests **what the engine decided and on what evidence**. It does
not attest that the workload ran in the selected region (no consequence
finality). Its verdict is therefore `VALID_NONCONSEQUENTIAL`.

## What is signed

`veklom.decision-receipt.v1` payload (all keys canonicalized with JCS):

| Field | Meaning |
| --- | --- |
| `decision_frame_id`, `request_id`, `issued_at` | Identity of the decision |
| `issuer.node_id`, `issuer.key_id` | Router node and signing key (`ed25519:` + first 32 hex of SHA-256 of the raw public key) |
| `decision.*` | action, reason code, decision mode, operating mode, selected and baseline region, doctrine version |
| `evidence.*` | signal confidence, `fallback_used`, carbon provider, water authority mode, provider disagreement %, provider snapshot refs |
| `bindings.trace_payload_sha256` | `sha256:` of JCS(stored trace payload) — reproducible by anyone holding the trace |
| `bindings.trace_hash`, `previous_trace_hash`, `trace_sequence_number`, `input_signal_hash`, `proof_hash` | Existing hash chain and proof hash, computed with the legacy `ecobe-sorted-json.v0` canonicalizer |

Envelope (`veklom.decision-receipt-envelope.v1`):

```json
{
  "protocol": "veklom.decision-receipt-envelope.v1",
  "receipt_hash": "sha256:<hex of SHA-256(JCS(payload))>",
  "payload": { "...": "see above" },
  "signature": { "alg": "Ed25519", "key_id": "ed25519:…", "value": "<base64url>" }
}
```

The signature covers `"veklom.decision-receipt.v1.signature" || 0x00 || SHA-256(JCS(payload))`.
The domain tag is fixed by the protocol (never read from the envelope), so a
signature made by the same key for another object type cannot be replayed as a
receipt.

## Verification verdicts

| Verdict | Cause |
| --- | --- |
| `VALID_NONCONSEQUENTIAL` | Structure, content hash, trust material, signature and (if supplied) trace binding all hold |
| `REJECTED_TAMPERED` (`F-4`) | Payload does not hash to `receipt_hash`, or the supplied trace does not match the bound hash / frame |
| `REJECTED_UNAUTHORIZED` | Signature invalid, or envelope key id differs from the signed issuer key id |
| `REJECTED_INCOMPLETE_BUNDLE` (`F-10`) | Malformed envelope, unknown protocol, unsupported algorithm |
| `INDETERMINATE_MISSING_TRUST_MATERIAL` | Verifier has no trusted key for the key id, or the key does not hash to that id |

## Endpoints

Both are behind `internalServiceGuard`, like the other decision endpoints; the
engine is private by contract.

- `GET /api/v1/ci/receipts/keys` → `{ protocol, status: "active" | "not_configured", keys: [{ keyId, alg, publicKeyPem, publicKeyRaw }] }`
- `GET /api/v1/ci/decisions/:decisionFrameId/receipt` →
  `{ decisionFrameId, receipt, engineVerification }`, where `engineVerification`
  re-checks the receipt against the currently stored trace (so database edits
  after signing surface here). `404 RECEIPT_NOT_ISSUED` when the decision exists
  without a receipt; `404 DECISION_NOT_FOUND` otherwise.

## Operating it

```bash
npm run receipt:keygen          # prints keyId, publicKeyPem, DECISION_RECEIPT_SIGNING_KEY
```

Set `DECISION_RECEIPT_SIGNING_KEY` as a runtime secret (PKCS#8 PEM, base64
PKCS#8 DER, or base64 32-byte seed). Without it, no receipts are issued and
routing is unaffected. Apply the `20261011120000_add_decision_receipts`
migration with `npm run prisma:migrate:deploy`.

Receipts are written after the decision transaction commits. A signing or
storage failure is logged (`Failed to issue decision receipt`) and never blocks
routing; the decision then reads as `RECEIPT_NOT_ISSUED`, never as a fake or
unsigned receipt.

## Verifying offline

```bash
npm run receipt:verify -- \
  --receipt receipt.json \   # output of the receipt endpoint, or a bare envelope
  --keys keys.json \         # output of the keys endpoint, or a PEM public key
  --trace trace.json         # optional: output of /decisions/:id/trace/raw
```

The verifier (`src/lib/proof/receipt-verifier.ts` + `jcs.ts`) imports nothing
from the engine. Key ids are recomputed from key bytes, never trusted from the
keys file. Exit code is 0 only for `VALID_NONCONSEQUENTIAL`.

## Known limits

- One active key; there is no rotation history yet, so receipts signed by a
  retired key need that public key supplied out of band.
- Decisions made before this change, or while no key was configured, have no
  receipt and are not back-filled (signing later would attest the current
  database, not the decision moment).
- The legacy `trace_hash` / `proof_hash` use a sorted-key canonicalizer that is
  not RFC 8785; they are bound as opaque values. The JCS
  `trace_payload_sha256` is the binding an independent verifier can recompute.
