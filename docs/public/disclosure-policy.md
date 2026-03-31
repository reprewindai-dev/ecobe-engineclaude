# CO2 Router — Disclosure Policy (Public vs Confidential)

This policy defines what is safe to publish and what must remain confidential.

## Public

Safe to disclose:

- Product purpose and high‑level system boundary
- Public‑facing API endpoints and response identifiers
- High‑level data sources (names, not implementation details)
- Public status and assurance statements
- Public performance targets (not internal benchmarks)

## Controlled (Share Under NDA or Private Docs)

Share only with trusted parties:

- Detailed architecture diagrams and sequence flows
- Internal service dependencies and deployment topology
- Detailed cache keys and decision heuristics
- Internal alerting and incident response flows

## Confidential (Never Publish)

Never disclose publicly:

- Internal credentials, secrets, or private keys
- Exact decision doctrine parameters and thresholds
- Detailed replay mechanics and enforcement rules
- Proprietary datasets, transforms, or scoring algorithms

## Enforcement

Public documentation must be reviewed against this policy before release.
Private documentation should live under `docs/private/` and must not be pushed
to public repositories.
