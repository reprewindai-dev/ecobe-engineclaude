# CO2 Router Pre-Execution Authorization

This action turns GitHub Actions into a real pre-execution control point. It calls the canonical CO2 Router authorization endpoint at `POST /api/v1/ci/authorize`, reads the full doctrine response, and exposes enforcement-grade outputs for all five binding actions:

- `run_now`
- `reroute`
- `delay`
- `throttle`
- `deny`

It does not invent local doctrine. It consumes the engine response verbatim and enforces the returned action before the expensive workload job starts.

## Required inputs

```yaml
- name: CO2 Router authorization
  id: authorize
  uses: ./github-action
  with:
    engine-url: ${{ secrets.ECOBE_ENGINE_URL }}
    api-key: ${{ secrets.ECOBE_INTERNAL_API_KEY }}
    workload-id: build-and-test
    job-name: governed-build
    preferred-regions: us-east-1,us-west-2,eu-west-1
    workload-class: interactive
    criticality: standard
    water-policy-profile: default
    allow-delay: true
    max-delay-minutes: 30
```

## Hard enforcement behavior

By default the action fails closed:

- `deny` => exits non-zero immediately
- `delay` => exits non-zero immediately and surfaces `not-before`
- non-executable bundle => exits non-zero immediately

If a workflow wants to inspect the result first and branch manually, set `continue-on-error: true` on the step or set one of these flags:

- `fail-on-deny: false`
- `fail-on-delay: false`
- `fail-on-non-executable: false`

## Outputs

Primary outputs:

- `decision`
- `policy-action`
- `reason-code`
- `decision-frame-id`
- `proof-hash`
- `approved-region`
- `approved-runner-label`
- `approved-runs-on-json`
- `matrix-allowed-regions`
- `executable`
- `environment`
- `max-parallel`
- `not-before`
- `policy-trace`
- `trust`

Compatibility outputs:

- `decision-id`
- `selected-runner`
- `selected-region`
- `carbon-intensity`
- `baseline`
- `savings`
- `recommendation`

## Canonical workflow pattern

```yaml
jobs:
  authorize:
    runs-on: ubuntu-latest
    outputs:
      decision: ${{ steps.ecobe.outputs.decision }}
      executable: ${{ steps.ecobe.outputs.executable }}
      approved_runs_on_json: ${{ steps.ecobe.outputs.approved-runs-on-json }}
      max_parallel: ${{ steps.ecobe.outputs.max-parallel }}
      approved_region: ${{ steps.ecobe.outputs.approved-region }}
      not_before: ${{ steps.ecobe.outputs.not-before }}
      decision_frame_id: ${{ steps.ecobe.outputs.decision-frame-id }}
      proof_hash: ${{ steps.ecobe.outputs.proof-hash }}
    steps:
      - uses: actions/checkout@v4
      - id: ecobe
        continue-on-error: true
        uses: ./github-action
        with:
          engine-url: ${{ secrets.ECOBE_ENGINE_URL }}
          api-key: ${{ secrets.ECOBE_INTERNAL_API_KEY }}
          workload-id: build-and-test
          preferred-regions: us-east-1,us-west-2,eu-west-1
          workload-class: interactive
          criticality: standard
          max-delay-minutes: 30

      - name: Stop immediately on deny or delay
        shell: bash
        run: |
          if [ "${{ steps.ecobe.outputs.decision }}" = "deny" ]; then
            echo "Denied by CO2 Router"
            exit 1
          fi
          if [ "${{ steps.ecobe.outputs.decision }}" = "delay" ]; then
            echo "Deferred until ${{ steps.ecobe.outputs.not-before }}"
            exit 1
          fi

  governed-workload:
    needs: authorize
    if: ${{ needs.authorize.outputs.executable == 'true' && needs.authorize.outputs.decision != 'deny' && needs.authorize.outputs.decision != 'delay' }}
    runs-on: ${{ fromJson(needs.authorize.outputs.approved_runs_on_json) }}
    strategy:
      fail-fast: false
      max-parallel: ${{ fromJson(needs.authorize.outputs.max_parallel) }}
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4
      - name: Record governed execution
        run: |
          echo "Approved region: ${{ needs.authorize.outputs.approved_region }}"
          echo "Decision frame: ${{ needs.authorize.outputs.decision_frame_id }}"
          echo "Proof hash: ${{ needs.authorize.outputs.proof_hash }}"
      - name: Execute workload shard
        run: npm test -- --shard=${{ matrix.shard }}
```

## Contract notes

- The canonical endpoint is `/api/v1/ci/authorize`.
- `/api/v1/ci/route` and `/api/v1/ci/carbon-route` remain compatibility aliases.
- `decisionMode=runtime_authorization` is executable.
- `decisionMode=scenario_planning` is explicitly non-executable.
- `throttle` is surfaced via `max-parallel`.
- `reroute` is surfaced via `approved-region`, `approved-runner-label`, and `matrix-allowed-regions`.
