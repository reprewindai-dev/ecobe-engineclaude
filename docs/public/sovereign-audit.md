# Sovereign Audit & Merkle Proof Ledgering

Status: implemented in the locked stack (TypeScript / Node / Express). No new runtime, language, or datastore is introduced.

## Purpose

Every exported CI decision batch is anchored by a Merkle root so that a single decision record can be proven to belong to an exported batch without disclosing the rest of the batch, and so that any mutation of an exported record is detectable.

This closes Law 5 (proof-first outputs) for batch exports: the pre-existing export chain already linked batches to each other; the Merkle root now binds each record to its batch.

## Tree construction

Implemented in `src/lib/proof/merkle.ts`.

- Leaf hash: `sha256(0x00 || sha256(canonicalJson(record)))`
- Internal node: `sha256(0x01 || left || right)`
- Canonical JSON reuses `sha256Canonical` from `src/lib/proof/export-chain.ts`, so key order does not affect the root.
- Domain separation (`0x00` / `0x01`) prevents an internal node from being replayed as a leaf.
- An odd trailing node is promoted unchanged instead of duplicated, avoiding the CVE-2012-2459 class of duplicate-leaf root collisions.
- Version tag: `ecobe-merkle-v1`, algorithm `sha256`. Both are checked at verification time.

Exported API:

| Function | Purpose |
|---|---|
| `buildMerkleTree(records)` | Builds leaves + all layers; returns `root`, `leafCount`, `leaves`, `layers`. |
| `computeMerkleRoot(records)` | Root only. |
| `generateProofFromTree(tree, leafIndex)` | O(log n) inclusion proof against a prebuilt tree. |
| `generateMerkleProof(records, leafIndex)` | Convenience: build then prove. |
| `verifyMerkleProof(proof, expectedRoot?)` | Recomputes the root from the leaf hash and path. |
| `verifyRecordAgainstRoot(record, proof, expectedRoot)` | Re-hashes the record, then verifies the path. |

## Anchoring

`persistExportBatch(batchId, payload, merkle?)` stores the Merkle metadata in the batch envelope and in `data/exports/ci/index.json`, and folds `merkleRoot` into the batch hash, so the root is covered by the existing batch-to-batch hash chain.

`readExportBatch(batchId)` reads a persisted envelope back for proof generation and verification.

## Endpoints

### `POST /api/v1/ci/exports/proof` (internal service guard)

Unchanged request shape (`{ limit?: number }`). Response gains:

```jsonc
{
  "batchId": "ci-proof-2026-08-21T07-50-00-000Z",
  "batchHash": "…",
  "previousBatchHash": "…",
  "chainPosition": 12,
  "exportedRecords": 100,
  "batchPath": "…",
  "merkleRoot": "64-hex",
  "merkleAlgorithm": "sha256",
  "merkleVersion": "ecobe-merkle-v1",
  "merkleLeafCount": 100,
  "createdAt": "…"
}
```

### `GET /api/v1/ci/exports/proof/:batchId/merkle/:decisionFrameId` (internal service guard)

Returns the record and its inclusion proof:

```jsonc
{
  "batchId": "…",
  "batchHash": "…",
  "decisionFrameId": "…",
  "record": { "decisionFrameId": "…", "selectedRegion": "…", "…": "…" },
  "proof": {
    "version": "ecobe-merkle-v1",
    "algorithm": "sha256",
    "root": "64-hex",
    "leafHash": "64-hex",
    "leafIndex": 7,
    "leafCount": 100,
    "path": [{ "hash": "64-hex", "position": "left" }]
  }
}
```

`404` when the batch or the decision frame is not present in that batch.

### `POST /api/v1/ci/exports/proof/verify` (public verification)

```jsonc
{
  "batchId": "…",          // optional; when present the anchored root is used
  "expectedRoot": "64-hex", // optional; overrides the anchored root
  "proof": { "…": "…" }     // proof object as returned above
}
```

Response:

```jsonc
{
  "verified": true,
  "batchId": "…",
  "anchoredRoot": "64-hex",
  "expectedRoot": "64-hex",
  "verifiedAt": "…"
}
```

Verification is intentionally unauthenticated: a third-party auditor holding an exported record and its proof can confirm inclusion without engine credentials. It reads no decision data beyond the batch's anchored root.

`400` on malformed proofs, `404` when a referenced batch has no anchored root.

## Test coverage

`src/__tests__/merkle-generator.test.ts` and `src/__tests__/export-chain.test.ts`, run by `npm test`:

- determinism and key-order independence
- leaf/node domain separation
- proof round-trip for every leaf across odd and even tree widths (1, 2, 3, 5, 8, 13)
- tampered record, altered path, and wrong-root rejection
- out-of-range leaf index rejection
- all 10,000 leaves of a 10,000-record batch verified against the batch root
- proof generation latency under the 5 ms per-proof target against a prebuilt tree
- Merkle root anchored into and read back from a persisted export batch envelope

## Operational notes

- Proof generation is pure computation over the persisted export envelope; no external service, key material, or network call is involved.
- Rollback: the `merkle` field is optional on the envelope. Batches written before this change read back with `merkle: null` and remain valid on the batch hash chain; the verify endpoint returns `404` for them rather than a false positive.
