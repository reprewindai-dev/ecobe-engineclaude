import crypto from 'crypto'

import { sha256Canonical } from './export-chain'

export const MERKLE_ALGORITHM = 'sha256'
export const MERKLE_TREE_VERSION = 'ecobe-merkle-v1'

const LEAF_DOMAIN = Buffer.from([0x00])
const NODE_DOMAIN = Buffer.from([0x01])

export interface MerkleProofStep {
  hash: string
  position: 'left' | 'right'
}

export interface MerkleProof {
  version: string
  algorithm: string
  root: string
  leafHash: string
  leafIndex: number
  leafCount: number
  path: MerkleProofStep[]
}

export interface MerkleTree {
  version: string
  algorithm: string
  root: string
  leafCount: number
  leaves: string[]
  layers: string[][]
}

function sha256Hex(...parts: Buffer[]): string {
  const hash = crypto.createHash(MERKLE_ALGORITHM)
  for (const part of parts) {
    hash.update(part)
  }
  return hash.digest('hex')
}

function fromHex(hex: string): Buffer {
  return Buffer.from(hex, 'hex')
}

/**
 * Domain-separated leaf hash. The 0x00 prefix makes it impossible to reinterpret
 * an internal node as a leaf (second-preimage resistance).
 */
export function hashLeaf(record: unknown): string {
  return sha256Hex(LEAF_DOMAIN, Buffer.from(sha256Canonical(record), 'hex'))
}

export function hashNode(left: string, right: string): string {
  return sha256Hex(NODE_DOMAIN, fromHex(left), fromHex(right))
}

function buildLayers(leaves: string[]): string[][] {
  const layers: string[][] = [leaves]
  let current = leaves

  while (current.length > 1) {
    const next: string[] = []
    for (let i = 0; i < current.length; i += 2) {
      // Odd trailing node is promoted unchanged rather than duplicated, which
      // avoids the CVE-2012-2459 style duplicate-leaf root collision.
      next.push(i + 1 < current.length ? hashNode(current[i], current[i + 1]) : current[i])
    }
    layers.push(next)
    current = next
  }

  return layers
}

export function buildMerkleTree(records: readonly unknown[]): MerkleTree {
  if (records.length === 0) {
    throw new Error('Merkle tree requires at least one record')
  }

  const leaves = records.map((record) => hashLeaf(record))
  const layers = buildLayers(leaves)

  return {
    version: MERKLE_TREE_VERSION,
    algorithm: MERKLE_ALGORITHM,
    root: layers[layers.length - 1][0],
    leafCount: leaves.length,
    leaves,
    layers,
  }
}

export function computeMerkleRoot(records: readonly unknown[]): string {
  return buildMerkleTree(records).root
}

/**
 * Proof generation against an already built tree is O(log n) hashing-free work,
 * which is the path used when many proofs are served from one export batch.
 */
export function generateProofFromTree(tree: MerkleTree, leafIndex: number): MerkleProof {
  if (!Number.isInteger(leafIndex) || leafIndex < 0 || leafIndex >= tree.leafCount) {
    throw new Error(`Leaf index ${leafIndex} is out of range for ${tree.leafCount} records`)
  }

  const { layers } = tree
  const path: MerkleProofStep[] = []

  let index = leafIndex
  for (let level = 0; level < layers.length - 1; level += 1) {
    const layer = layers[level]
    const isRightNode = index % 2 === 1
    const siblingIndex = isRightNode ? index - 1 : index + 1

    if (siblingIndex < layer.length) {
      path.push({ hash: layer[siblingIndex], position: isRightNode ? 'left' : 'right' })
    }

    index = Math.floor(index / 2)
  }

  return {
    version: tree.version,
    algorithm: tree.algorithm,
    root: tree.root,
    leafHash: tree.leaves[leafIndex],
    leafIndex,
    leafCount: tree.leafCount,
    path,
  }
}

export function generateMerkleProof(records: readonly unknown[], leafIndex: number): MerkleProof {
  if (!Number.isInteger(leafIndex) || leafIndex < 0 || leafIndex >= records.length) {
    throw new Error(`Leaf index ${leafIndex} is out of range for ${records.length} records`)
  }

  return generateProofFromTree(buildMerkleTree(records), leafIndex)
}

export function verifyMerkleProof(proof: MerkleProof, expectedRoot?: string): boolean {
  if (proof.algorithm !== MERKLE_ALGORITHM || proof.version !== MERKLE_TREE_VERSION) {
    return false
  }
  if (!/^[0-9a-f]{64}$/.test(proof.leafHash) || !/^[0-9a-f]{64}$/.test(proof.root)) {
    return false
  }

  let computed = proof.leafHash
  for (const step of proof.path) {
    if (!/^[0-9a-f]{64}$/.test(step.hash)) {
      return false
    }
    computed = step.position === 'left' ? hashNode(step.hash, computed) : hashNode(computed, step.hash)
  }

  if (computed !== proof.root) {
    return false
  }

  return expectedRoot === undefined || expectedRoot === proof.root
}

export function verifyRecordAgainstRoot(record: unknown, proof: MerkleProof, expectedRoot: string): boolean {
  return hashLeaf(record) === proof.leafHash && verifyMerkleProof(proof, expectedRoot)
}
