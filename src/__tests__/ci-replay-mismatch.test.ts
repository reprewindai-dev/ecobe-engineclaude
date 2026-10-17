import { findReplayMismatches, pinReplayProofHash } from '../lib/ci/replay'

const stored = {
  decision: 'reroute',
  selectedRegion: 'eu-west-1',
  reasonCode: 'SEKED_POLICY_AMBER_REROUTE',
  proofHash: 'stored-hash',
}

describe('findReplayMismatches', () => {
  it('reports no mismatch when the recomputed hash equals the stored hash', () => {
    expect(
      findReplayMismatches({ stored, replayed: stored, recomputedProofHash: 'stored-hash' }),
    ).toEqual([])
  })

  it('reports proofHash when the recomputed hash differs, even though the replay response was pinned to the stored hash', () => {
    // Replay recomputed a different hash; the trace-backed pin then overwrites the response surface.
    const replayResponse = {
      ...stored,
      proofHash: 'recomputed-different-hash',
      proofEnvelope: { proofHash: 'recomputed-different-hash' },
      proofRecord: { proof_hash: 'recomputed-different-hash' },
      workflowOutputs: { proofHash: 'recomputed-different-hash' },
      kubernetesEnforcement: { annotations: {} },
      enforcementBundle: { kubernetes: { annotations: {} } },
    }
    const pinned = pinReplayProofHash(replayResponse as any, 'stored-hash')
    expect(pinned.proofHash).toBe('stored-hash') // the pin hides the difference...

    // ...so the comparison must use the pre-pin value to still catch it.
    expect(
      findReplayMismatches({
        stored,
        replayed: pinned,
        recomputedProofHash: 'recomputed-different-hash',
      }),
    ).toEqual(['proofHash'])
  })

  it('shows the old comparison was vacuous: pinned replay always equals stored', () => {
    const pinned = pinReplayProofHash(
      {
        ...stored,
        proofHash: 'anything',
        proofEnvelope: { proofHash: 'anything' },
        proofRecord: { proof_hash: 'anything' },
        workflowOutputs: { proofHash: 'anything' },
        kubernetesEnforcement: { annotations: {} },
        enforcementBundle: { kubernetes: { annotations: {} } },
      } as any,
      'stored-hash',
    )
    expect(stored.proofHash === pinned.proofHash).toBe(true)
  })

  it('reports decision, region and reason mismatches independently', () => {
    expect(
      findReplayMismatches({
        stored,
        replayed: { decision: 'deny', selectedRegion: 'us-east-1', reasonCode: 'OTHER', proofHash: 'stored-hash' },
        recomputedProofHash: 'stored-hash',
      }),
    ).toEqual(['decision', 'selectedRegion', 'reasonCode'])
  })

  it('treats a missing stored response as a mismatch on every field', () => {
    expect(
      findReplayMismatches({ stored: null, replayed: stored, recomputedProofHash: 'stored-hash' }),
    ).toEqual(['decision', 'selectedRegion', 'reasonCode', 'proofHash'])
  })
})
