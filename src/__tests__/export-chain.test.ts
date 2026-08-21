import { persistExportBatch, readExportBatch } from '../lib/proof/export-chain'
import { buildMerkleTree, generateProofFromTree, verifyRecordAgainstRoot } from '../lib/proof/merkle'

describe('proof export chain', () => {
  it('anchors a Merkle root in the persisted batch envelope', () => {
    const records = [{ decisionFrameId: 'frame-a' }, { decisionFrameId: 'frame-b' }, { decisionFrameId: 'frame-c' }]
    const tree = buildMerkleTree(records)
    const batchId = `test-batch-${Date.now()}-merkle`

    const chain = persistExportBatch(batchId, { decisions: records }, {
      version: tree.version,
      algorithm: tree.algorithm,
      root: tree.root,
      leafCount: tree.leafCount,
    })

    expect(chain.merkleRoot).toBe(tree.root)

    const envelope = readExportBatch(batchId)
    expect(envelope?.merkle?.root).toBe(tree.root)
    expect(envelope?.merkle?.leafCount).toBe(3)

    const proof = generateProofFromTree(tree, 1)
    expect(verifyRecordAgainstRoot(records[1], proof, envelope!.merkle!.root)).toBe(true)
  })

  it('creates chained hashes for consecutive batches', () => {
    const first = persistExportBatch(`test-batch-${Date.now()}-a`, { a: 1 })
    const second = persistExportBatch(`test-batch-${Date.now()}-b`, { b: 2 })

    expect(first.batchHash).toBeTruthy()
    expect(second.batchHash).toBeTruthy()
    expect(second.previousBatchHash).toBe(first.batchHash)
  })
})

