import {
  buildMerkleTree,
  computeMerkleRoot,
  generateMerkleProof,
  generateProofFromTree,
  hashLeaf,
  verifyMerkleProof,
  verifyRecordAgainstRoot,
  MERKLE_ALGORITHM,
  MERKLE_TREE_VERSION,
} from '../lib/proof/merkle'

interface SettlementRecord {
  decisionFrameId: string
  selectedRegion: string
  carbonIntensity: number
  savings: number
}

function settlement(index: number): SettlementRecord {
  return {
    decisionFrameId: `frame-${index}`,
    selectedRegion: index % 2 === 0 ? 'ca-central-1' : 'eu-north-1',
    carbonIntensity: 100 + (index % 37),
    savings: index * 1.5,
  }
}

function settlements(count: number): SettlementRecord[] {
  return Array.from({ length: count }, (_unused, index) => settlement(index))
}

describe('merkle proof generator', () => {
  it('rejects an empty record set', () => {
    expect(() => buildMerkleTree([])).toThrow(/at least one record/)
  })

  it('roots a single record at its own leaf hash', () => {
    const record = settlement(0)
    const tree = buildMerkleTree([record])

    expect(tree.leafCount).toBe(1)
    expect(tree.root).toBe(hashLeaf(record))
    expect(tree.algorithm).toBe(MERKLE_ALGORITHM)
    expect(tree.version).toBe(MERKLE_TREE_VERSION)
  })

  it('is deterministic and key-order independent', () => {
    const canonical = computeMerkleRoot([{ a: 1, b: 2 }, { c: 3 }])
    const reordered = computeMerkleRoot([{ b: 2, a: 1 }, { c: 3 }])

    expect(canonical).toBe(reordered)
    expect(computeMerkleRoot([{ c: 3 }, { a: 1, b: 2 }])).not.toBe(canonical)
  })

  it('separates leaf and internal node domains', () => {
    const tree = buildMerkleTree([settlement(0), settlement(1)])

    expect(tree.root).not.toBe(tree.leaves[0])
    expect(tree.root).not.toBe(tree.leaves[1])
  })

  it('verifies every leaf for odd and even tree widths', () => {
    for (const count of [1, 2, 3, 5, 8, 13]) {
      const records = settlements(count)
      const root = computeMerkleRoot(records)

      for (let index = 0; index < count; index += 1) {
        const proof = generateMerkleProof(records, index)
        expect(proof.root).toBe(root)
        expect(verifyMerkleProof(proof, root)).toBe(true)
        expect(verifyRecordAgainstRoot(records[index], proof, root)).toBe(true)
      }
    }
  })

  it('rejects a proof for a tampered record', () => {
    const records = settlements(16)
    const root = computeMerkleRoot(records)
    const proof = generateMerkleProof(records, 7)
    const tampered = { ...records[7], savings: records[7].savings + 1 }

    expect(verifyRecordAgainstRoot(tampered, proof, root)).toBe(false)
  })

  it('rejects a proof whose path was altered', () => {
    const records = settlements(16)
    const root = computeMerkleRoot(records)
    const proof = generateMerkleProof(records, 3)
    const altered = {
      ...proof,
      path: proof.path.map((step, index) =>
        index === 0 ? { ...step, position: step.position === 'left' ? ('right' as const) : ('left' as const) } : step,
      ),
    }

    expect(verifyMerkleProof(altered, root)).toBe(false)
  })

  it('rejects a proof checked against a different batch root', () => {
    const proof = generateMerkleProof(settlements(8), 2)
    const otherRoot = computeMerkleRoot(settlements(9))

    expect(verifyMerkleProof(proof, otherRoot)).toBe(false)
  })

  it('rejects an out-of-range leaf index', () => {
    expect(() => generateMerkleProof(settlements(4), 4)).toThrow(/out of range/)
    expect(() => generateMerkleProof(settlements(4), -1)).toThrow(/out of range/)
  })

  it('changes the root when any record in the batch changes', () => {
    const records = settlements(64)
    const mutated = records.map((record, index) =>
      index === 40 ? { ...record, selectedRegion: 'us-west-2' } : record,
    )

    expect(computeMerkleRoot(mutated)).not.toBe(computeMerkleRoot(records))
  })

  it('verifies 10,000 settled transactions within the latency target', () => {
    const records = settlements(10_000)
    const tree = buildMerkleTree(records)

    expect(tree.leafCount).toBe(10_000)

    for (let index = 0; index < records.length; index += 1) {
      expect(verifyRecordAgainstRoot(records[index], generateProofFromTree(tree, index), tree.root)).toBe(true)
    }

    const started = process.hrtime.bigint()
    for (let index = 0; index < 1_000; index += 1) {
      generateProofFromTree(tree, index)
    }
    const perProofMs = Number(process.hrtime.bigint() - started) / 1_000_000 / 1_000

    expect(perProofMs).toBeLessThan(5)
  })
})
