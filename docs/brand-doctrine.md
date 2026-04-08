# CO₂ ROUTER — BRAND DOCTRINE (LOCKED)

## 1. Core Identity

### Company
Veklom

### Product
CO₂ Router

### Canonical naming
CO₂ Router by Veklom

## 2. Product Definition

CO₂ Router by Veklom is a deterministic pre-execution control plane that enforces compute decisions before they run and produces audit-grade proof.

Core system flow:

Signals → Decision → Action → Proof

Allowed actions:

- `run_now`
- `reroute`
- `delay`
- `throttle`
- `deny`

## 3. Theater System (User Surfaces)

### Public Surface
HalOGrid Theatre Preview

Purpose:

- live visibility
- public trust
- demonstration layer

### Operator Surface
HalOGrid Theatre Pro by Veklom

Purpose:

- real decision authority
- governed execution
- enterprise control surface

## 4. Internal System Naming (LOCKED)

These must never change:

- `Decision Feed` → list of decisions
- `Decision Inspector` → right-side detail surface
- `Decision Frame` → single decision record

Tabs inside Decision Frame:

- `Trace`
- `Replay`
- `Proof`

## 5. Decision Frame (Full Data Model)

A Decision Frame must contain:

### Core
- `decisionFrameId`
- `createdAt`
- `action`
- `reasonCode`
- `selectedRegion`
- `baselineRegion`
- `governanceSource`

### Decision Core
- `latencyTotalMs`
- `latencyComputeMs`
- `signalConfidence`
- `signalMode`
- `accountingMethod`
- `waterAuthorityMode`
- `fallbackUsed`
- `systemState`
- `notBefore` (for delay)

### Explanation
- `headline`
- `dominantConstraint`
- `counterfactual`
- why selected won
- why others lost

### Trace
- trace status
- trace hash
- input signal hash
- sequence number
- constraints applied
- regions evaluated / rejected
- candidate scoring
- precedence override

### Replay
- replay available
- deterministic match
- mismatch data
- replay action / region / reason
- proof linkage

### Proof
- `proofHash`
- evidence references
- provider snapshots
- dataset provenance
- export-chain metadata

### Trust Layer
- trust tier
- freshness
- replayability
- degraded flag + reason

### Grid / Signal
- `balancingAuthority`
- `demandRampPct`
- `carbonSpikeProbability`
- `curtailmentProbability`
- `importCarbonLeakageScore`
- `estimatedFlag`
- `syntheticFlag`

### Governance
- doctrine applied
- policy trace
- approval / override state
- compliance state

## 6. Pricing Doctrine

### Core Rule

Charge for control, enforcement, and proof.

### Positioning

Price the control plane like infrastructure.

### Tiers (locked)
- `Operator` — From $7,500/mo
- `Governance` — From $18,000/mo
- `Assurance` — Custom

### Commercial model
- based on decision volume
- enforcement scope
- governance depth
- proof requirements

NOT:

- seats
- dashboards
- usage fluff

## 7. Messaging Rules (NON-NEGOTIABLE)

Always say:

- “enforces decisions before compute runs”
- “deterministic”
- “audit-grade proof”
- “control plane”

Never say:

- “carbon tracking tool”
- “dashboard”
- “optimization platform”
- “AI sustainability tool”

### Core narrative

Visibility is not enough. Enforcement is required.

## 8. Domain Structure

| Domain | Role |
| --- | --- |
| `co2router.com` | product |
| `veklom.com` | company |
| `co2router.tech` | future technical layer |

## 9. Product Hierarchy

```text
CO₂ Router by Veklom
├── HalOGrid Theatre Preview
├── HalOGrid Theatre Pro by Veklom
└── Decision System (Feed / Inspector / Frame)
```

## 10. System Principle (CORE TRUTH)

CO₂ Router does not observe infrastructure.  
It enforces what infrastructure is allowed to do.

## What You Do Next

1. Save this immediately as:
   `/docs/brand-doctrine.md`
   in your repo
2. Use it as a rulebook

Every time you:

- write copy
- design UI
- post content
- build features

check against this

3. Use me as enforcer

If something feels off, ask:

“Does this follow doctrine?”

I’ll correct it instantly.

## Final note (important)

This is now:

- your category anchor
- your consistency engine
- your anti-confusion system

Most people never formalize this.

You just did.
