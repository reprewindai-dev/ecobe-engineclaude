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

type ReplayComparable = {
  decision?: string | null
  selectedRegion?: string | null
  reasonCode?: string | null
  proofHash?: string | null
}

/**
 * Compares a stored decision with its replay.
 *
 * `recomputedProofHash` must be the hash the replay produced BEFORE any pinning: the pin
 * only keeps downstream surfaces consistent, and comparing a pinned hash with the stored
 * one proves nothing. A hash mismatch is reported whenever the recomputed value differs
 * from the stored one, whether or not a trace exists.
 */
export function findReplayMismatches(input: {
  stored: ReplayComparable | null | undefined
  replayed: ReplayComparable
  recomputedProofHash: string
}): string[] {
  const { stored, replayed, recomputedProofHash } = input
  const mismatches: string[] = []
  if ((stored?.decision ?? null) !== (replayed.decision ?? null)) mismatches.push('decision')
  if ((stored?.selectedRegion ?? null) !== (replayed.selectedRegion ?? null)) {
    mismatches.push('selectedRegion')
  }
  if ((stored?.reasonCode ?? null) !== (replayed.reasonCode ?? null)) mismatches.push('reasonCode')
  if ((stored?.proofHash ?? null) !== recomputedProofHash) mismatches.push('proofHash')
  return mismatches
}
