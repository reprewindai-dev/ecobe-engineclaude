# ECOBE Carbon-Aware Runner — GitHub Action

Routes your CI/CD jobs to the greenest available runner region using
[ECOBE Engine](../ecobe-engine)'s real-time grid carbon intensity data.

---

## What it does

1. Calls ECOBE Engine's `/api/v1/ci/carbon-route` with your list of available runners.
2. ECOBE fetches live carbon intensity for each mapped region (via Electricity Maps).
3. Returns the runner with the lowest carbon footprint.
4. Writes a step summary with CO₂ metrics and savings % vs baseline.
5. (Optional) Suggests a delay window if a significantly greener window exists within `max-delay-minutes`.

---

## Quick start

```yaml
jobs:
  carbon-aware-build:
    runs-on: ubuntu-latest   # fallback; will be overridden below
    steps:
      - name: Pick greenest runner
        id: ecobe
        uses: reprewindai-dev/ecobe-engineclaude/github-action@main
        with:
          ecobe-url: ${{ secrets.ECOBE_ENGINE_URL }}
          runners: |
            [
              {"name": "ubuntu-latest",    "region": "US-CAL-CISO"},
              {"name": "ubuntu-22.04-eu",  "region": "FR"},
              {"name": "ubuntu-22.04-de",  "region": "DE"}
            ]

      - name: Use chosen runner for actual work
        run: |
          echo "Running on ${{ steps.ecobe.outputs.selected-runner }}"
          echo "Carbon intensity: ${{ steps.ecobe.outputs.carbon-intensity }} gCO2/kWh"
          echo "CO2 savings: ${{ steps.ecobe.outputs.savings-pct }}% vs baseline"
```

> **Note:** To actually execute subsequent jobs on the chosen runner, use a
> matrix or `workflow_dispatch` pattern — see the advanced example below.

---

## Using the output runner label for real job routing

GitHub Actions requires `runs-on` to be set at job definition time, so you
need a two-job pattern: one job to pick the runner, one job to use it.

```yaml
jobs:
  pick-runner:
    runs-on: ubuntu-latest
    outputs:
      runner: ${{ steps.ecobe.outputs.selected-runner }}
      savings: ${{ steps.ecobe.outputs.savings-pct }}
    steps:
      - name: Query ECOBE
        id: ecobe
        uses: reprewindai-dev/ecobe-engineclaude/github-action@main
        with:
          ecobe-url: ${{ secrets.ECOBE_ENGINE_URL }}
          runners: |
            [
              {"name": "ubuntu-latest",   "region": "US-CAL-CISO"},
              {"name": "ubuntu-eu-west",  "region": "FR"}
            ]

  build:
    needs: pick-runner
    runs-on: ${{ needs.pick-runner.outputs.runner }}
    steps:
      - uses: actions/checkout@v4
      - name: Build
        run: npm ci && npm run build
      - name: Report savings
        run: echo "This build saved ${{ needs.pick-runner.outputs.savings }}% CO2 vs baseline"
```

---

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `ecobe-url` | Yes | — | ECOBE Engine base URL |
| `runners` | Yes | — | JSON array of `{name, region}` runner candidates |
| `workload-type` | No | `build` | `build` \| `test` \| `deploy` \| `batch` |
| `max-delay-minutes` | No | `0` | Max minutes to delay for a greener window. `0` = always run immediately |
| `carbon-weight` | No | `0.7` | Weight for carbon intensity vs latency/cost in scoring |
| `fail-on-error` | No | `false` | Fail the step if ECOBE Engine is unreachable |

---

## Outputs

| Output | Description |
|--------|-------------|
| `selected-runner` | Runner label to use in `runs-on` |
| `selected-region` | Grid region of the selected runner |
| `carbon-intensity` | Live carbon intensity at chosen region (gCO₂/kWh) |
| `baseline-intensity` | Average intensity across all candidates (gCO₂/kWh) |
| `savings-pct` | CO₂ savings % vs average baseline |
| `recommendation` | `run_now` or `delay` |

---

## Step summary

Every run automatically writes a summary table to the GitHub Actions job summary:

```
### ECOBE Carbon-Aware Runner

| Metric             | Value                         |
|--------------------|-------------------------------|
| Selected runner    | `ubuntu-eu-west`              |
| Grid region        | FR                            |
| Carbon intensity   | 58 gCO₂/kWh                  |
| Baseline intensity | 310 gCO₂/kWh                 |
| CO₂ savings        | **81.3%** vs average          |
| Recommendation     | run_now                       |
```

---

## Prerequisites

- A running ECOBE Engine instance (see [ecobe-engine](../ecobe-engine))
- The engine URL stored as a GitHub Actions secret: `ECOBE_ENGINE_URL`
- Runners with region labels that map to Electricity Maps zone codes

### Common region codes

| GitHub runner label | Electricity Maps zone |
|--------------------|-----------------------|
| US East (N. Virginia) | `US-MIDA-PJM` |
| US West (N. California) | `US-CAL-CISO` |
| Europe (Ireland) | `GB` |
| Europe (Frankfurt) | `DE` |
| Europe (Paris) | `FR` |
| Europe (Stockholm) | `SE` |
| Asia Pacific (Tokyo) | `JP-TK` |

---

## How carbon savings are calculated

```
baseline_intensity  = average(carbon_intensity for all candidate runners)
savings_pct         = (baseline_intensity - selected_intensity) / baseline_intensity × 100
```

This is the "avoided emissions vs average" metric — a conservative, auditable
number that maps directly to standard carbon accounting baselines.

---

## Self-hosting ECOBE Engine

```bash
cd ecobe-engine
cp .env.example .env
# Add ELECTRICITY_MAPS_API_KEY
docker-compose up -d
```

API available at `http://localhost:3000`. See [ecobe-engine/README.md](../ecobe-engine/README.md) for full setup.
