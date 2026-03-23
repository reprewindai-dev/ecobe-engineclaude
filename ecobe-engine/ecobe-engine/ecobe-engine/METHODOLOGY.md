# ECOBE / CO₂ Router — Signal Methodology

## What This Engine Does

ECOBE is a carbon-intelligent routing engine. It tells workloads **where** and **when** to run based on the real-time carbon intensity of the electrical grid in each candidate region. The goal is simple: route compute to the cleanest power available, right now, with proof.

This is not an estimate. This is not a monthly average. Every routing decision is backed by real-time grid telemetry, multi-provider signal fusion, and auditable decision replay.

---

## The Lowest Defensible Signal Doctrine

Most carbon tools pick a single data source and trust it. ECOBE does not.

ECOBE implements **Lowest Defensible Signal** routing: when multiple providers disagree on carbon intensity for a region, the engine selects the **lowest intensity value that can be defended** — meaning it has provenance, a trust tier, and at least one corroborating signal.

This prevents two failure modes:
1. **Over-routing** — sending workloads to "clean" regions based on stale or synthetic data.
2. **Under-claiming** — reporting savings that cannot survive audit.

Every decision records which provider was used, which was the validation source, whether disagreement existed, and the percentage spread between providers.

---

## Signal Hierarchy

### Tier 1 — Real-Time Routing Signals

These drive actual routing decisions. Sub-second to 5-minute freshness.

**WattTime (MOER)**
- Marginal Operating Emissions Rate — the carbon intensity of the *next* unit of electricity generated.
- Current MOER + 24h forecast.
- This is the **primary causal signal** for US regions. When WattTime says the marginal generator in PJM is a gas peaker vs. wind, that directly determines whether a workload should run there now or wait.
- Used for: fast-path routing, delay scheduling, avoided-emissions math.

**Electricity Maps**
- Flow-traced average carbon intensity — accounts for cross-border electricity imports/exports.
- Electricity mix (% renewable, fossil, nuclear), 72h forecast, zone-level granularity.
- Includes estimated and synthetic labels where data quality is incomplete.
- Used for: coherent grid intelligence, renewable % context, cross-zone effects, international regions where WattTime has no coverage.

### Tier 2 — Predictive Telemetry

These do not route directly but inform confidence, delay windows, and risk scoring.

**EIA-930 (via GridStatus.io + direct EIA API fallback)**
- US grid operational data: demand, generation by fuel type, interchange between balancing authorities.
- ECOBE derives from this:
  - `demandRampPct` — how fast demand is climbing or falling.
  - `fossilRatio` / `renewableRatio` — current generation mix.
  - `carbonSpikeProbability` — likelihood of a near-term carbon spike based on ramp + fuel mix.
  - `curtailmentProbability` — likelihood of renewable curtailment (supply exceeds demand + export capacity).
  - `importCarbonLeakageScore` — whether a "clean" region is importing dirty power from neighbors.
- Used for: confidence adjustment, spike/curtailment opportunity detection, leakage flagging.

### Tier 3 — Structural Validation

These provide long-term context. They never override real-time signals.

**Ember (Annual/Monthly Data)**
- Structural carbon baseline per country/region.
- Monthly generation mix, demand trends, wind/solar capacity.
- Used to validate whether a region's real-time signal is consistent with its structural profile. If WattTime says Germany is at 50 gCO₂/kWh but Ember shows Germany's structural baseline is 350, the engine flags the discrepancy rather than blindly trusting either one.
- Used for: structural validation, trend context, regional profiling.

---

## How a Routing Decision Works

1. **Candidate generation** — The engine identifies all eligible regions for the workload (based on cloud provider, latency constraints, compliance rules).

2. **Signal collection** — For each candidate region, the engine fetches current carbon intensity from Tier 1 providers, plus EIA-930 telemetry and Ember structural profiles where available.

3. **Provider fusion** — If multiple Tier 1 providers cover a region, the engine compares their values. If they agree (within threshold), the lowest is used. If they disagree, the engine records the disagreement and uses the lowest value that has corroboration from at least one other signal layer.

4. **Confidence scoring** — Each region gets a quality tier (`high` / `medium` / `low`) based on:
   - Number of providers with coverage.
   - Freshness of the signal.
   - Whether the signal is estimated or synthetic.
   - Whether EIA-930 telemetry corroborates or contradicts the carbon intensity.
   - Structural consistency with Ember baseline.

5. **Scoring** — Regions are scored on a composite of carbon intensity, confidence, forecast stability, and workload constraints (latency ceiling, deadline buffer, compliance).

6. **Selection** — The lowest-carbon region that meets all constraints is selected. If no region meets constraints, the engine routes to the lowest-carbon feasible region and flags the compromise.

7. **Decision logging** — Every decision is persisted with full provenance: signals used, providers consulted, disagreement state, confidence tier, carbon delta vs. default region, and a replay-capable decision frame.

---

## What Gets Recorded on Every Decision

```
selectedRegion
carbonIntensity
score
qualityTier (high | medium | low)
carbon_delta_g_per_kwh
forecast_stability
provider_disagreement { flag, pct }
balancingAuthority
demandRampPct
carbonSpikeProbability
curtailmentProbability
importCarbonLeakageScore
source_used
validation_source
fallback_used
estimatedFlag
syntheticFlag
predicted_clean_window
decisionFrameId
```

Every field is nullable. If a signal is unavailable, the field is `null` — never backfilled with a guess.

---

## What Makes This Different

**vs. Cloud provider carbon dashboards (AWS, Google, Azure)**
Cloud providers report carbon at monthly granularity, often with 2-3 month delays. They use location-based accounting (grid average) rather than marginal emissions. ECOBE uses real-time marginal data and makes routing decisions *before* the workload runs, not after.

**vs. Single-source carbon APIs**
Tools that wrap a single provider (just WattTime, or just Electricity Maps) cannot detect when that provider is wrong. ECOBE cross-references multiple providers and flags disagreement. A single-source tool has no way to know if its data is stale, estimated, or structurally inconsistent.

**vs. Carbon offset platforms**
Offsets are retrospective. ECOBE is prospective — it avoids emissions by routing to cleaner power in the first place. The carbon delta is measured against what would have happened if the workload ran in the default region.

**vs. Static region selection**
Choosing "eu-west-1 because Ireland has lots of wind" is a structural bet, not a real-time decision. Wind output varies hour by hour. ECOBE makes the decision at execution time based on what the grid looks like right now.

---

## Accuracy Targets

| Metric | Target |
|---|---|
| Carbon forecast variance vs. realized intensity | ≤ 12% |
| Clean window detection accuracy | ≥ 85% |
| Confidence calibration error | ≤ 10% |
| Provider disagreement detection rate | ≥ 95% |

These are measured continuously against realized grid data and reported on the dashboard.

---

## Region Coverage

Initial scope covers the primary cloud regions across AWS, GCP, and Azure:

- `us-east-1` (N. Virginia / PJM)
- `us-west-2` (Oregon / BPA)
- `eu-west-1` (Ireland / IE-SEM)
- `eu-central-1` (Frankfurt / DE)
- `ap-southeast-1` (Singapore / SG)
- `ap-northeast-1` (Tokyo / JP)

EIA-930 telemetry is US-only. International regions use Electricity Maps + Ember for signal coverage.

---

## Billing Model

- **Free tier**: 1,000 commands/month
- **Pro**: 50,000 commands/month
- **Enterprise**: Unlimited with SLA
- Overage: $0.0015/command
- Simulation-only commands count at 0.5×
- Billing failure never blocks routing

---

*Built in Trenton, Ontario. Real signals. Real routing. Real proof.*
