type ReplayProofHashSurface = {
  proofHash: string
  proofEnvelope: {
    proofHash: string
  }
  proofRecord: {
    proof_hash: string
  }
  workflowOutputs: Record<string, string | number | boolean | null>
  kubernetesEnforcement: {
    annotations: Record<string, string>
  }
  enforcementBundle: {
    kubernetes: {
      annotations: Record<string, string>
    }
  }
}

export function pinReplayProofHash<T extends ReplayProofHashSurface>(response: T, proofHash: string): T {
  return {
    ...response,
    proofHash,
    proofEnvelope: {
      ...response.proofEnvelope,
      proofHash,
    },
    proofRecord: {
      ...response.proofRecord,
      proof_hash: proofHash,
    },
    workflowOutputs: {
      ...response.workflowOutputs,
      proofHash,
    },
    kubernetesEnforcement: {
      ...response.kubernetesEnforcement,
      annotations: {
        ...response.kubernetesEnforcement.annotations,
        'ecobe.io/proof-hash': proofHash,
      },
    },
    enforcementBundle: {
      ...response.enforcementBundle,
      kubernetes: {
        ...response.enforcementBundle.kubernetes,
        annotations: {
          ...response.enforcementBundle.kubernetes.annotations,
          'ecobe.io/proof-hash': proofHash,
        },
      },
    },
  }
}
