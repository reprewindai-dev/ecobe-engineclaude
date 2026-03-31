import { pinReplayProofHash } from '../lib/ci/replay'

describe('pinReplayProofHash', () => {
  it('pins all replay-visible proof hash surfaces to the trace-backed hash', () => {
    const response = {
      proofHash: 'old-proof-hash',
      proofEnvelope: {
        proofHash: 'old-proof-hash',
      },
      proofRecord: {
        proof_hash: 'old-proof-hash',
      },
      workflowOutputs: {
        proofHash: 'old-proof-hash',
        decision: 'reroute',
      },
      kubernetesEnforcement: {
        annotations: {
          'ecobe.io/proof-hash': 'old-proof-hash',
          'ecobe.io/reason-code': 'SEKED_POLICY_AMBER_REROUTE',
        },
      },
      enforcementBundle: {
        kubernetes: {
          annotations: {
            'ecobe.io/proof-hash': 'old-proof-hash',
            'ecobe.io/reason-code': 'SEKED_POLICY_AMBER_REROUTE',
          },
        },
      },
    } as any

    const pinned = pinReplayProofHash(response, 'trace-proof-hash')

    expect(pinned.proofHash).toBe('trace-proof-hash')
    expect(pinned.proofEnvelope.proofHash).toBe('trace-proof-hash')
    expect(pinned.proofRecord.proof_hash).toBe('trace-proof-hash')
    expect(pinned.workflowOutputs.proofHash).toBe('trace-proof-hash')
    expect(pinned.kubernetesEnforcement.annotations['ecobe.io/proof-hash']).toBe('trace-proof-hash')
    expect(pinned.enforcementBundle.kubernetes.annotations['ecobe.io/proof-hash']).toBe('trace-proof-hash')
  })
})
