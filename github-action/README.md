# ECOBE Carbon-Aware Runner Action

This action calls the existing ECOBE CI control-plane endpoint at `POST /api/v1/ci/carbon-route` and exposes workflow-usable outputs for:

- `run_now`
- `reroute`
- `delay`
- `throttle`
- `deny`

It does not pretend to move GitHub-hosted runners automatically. In V1 it returns the decision, approved region/runner, delay window, concurrency ceiling, and proof fields so the workflow can enforce them.

## Required inputs

```yaml
- name: ECOBE preflight
  id: ecobe
  uses: ./github-action
  with:
    engine-url: ${{ secrets.ECOBE_URL }}
    api-key: ${{ secrets.ECOBE_INTERNAL_API_KEY }}
    workload-id: ci-build
    candidate-regions: eastus,northeurope,norwayeast
    candidate-runners: ubuntu-latest,windows-latest,macos-latest
    duration-minutes: 20
    delay-tolerance-minutes: 30
    criticality: standard
    matrix-size: 12
```

## Example enforcement pattern

```yaml
jobs:
  preflight:
    runs-on: ubuntu-latest
    outputs:
      decision: ${{ steps.ecobe.outputs.decision }}
      approved_runner_label: ${{ steps.ecobe.outputs.approved-runner-label }}
      delay_seconds: ${{ steps.ecobe.outputs.delay-seconds }}
      max_parallel: ${{ steps.ecobe.outputs.max-parallel }}
      decision_id: ${{ steps.ecobe.outputs.decision-id }}
    steps:
      - name: ECOBE preflight
        id: ecobe
        uses: co2-router/ecobe-action@v1
        with:
          engine-url: ${{ secrets.ECOBE_URL }}
          api-key: ${{ secrets.ECOBE_INTERNAL_API_KEY }}
          workload-id: build-and-test
          candidate-regions: eastus,northeurope,norwayeast
          candidate-runners: ubuntu-latest,windows-latest,macos-latest
          duration-minutes: 20
          delay-tolerance-minutes: 30
          deadline: ${{ github.event.head_commit.timestamp }}
          criticality: standard
          matrix-size: 12

  integration-tests:
    needs: preflight
    if: ${{ needs.preflight.outputs.decision != 'deny' }}
    runs-on: ${{ needs.preflight.outputs.approved_runner_label }}
    strategy:
      fail-fast: false
      max-parallel: ${{ fromJSON(needs.preflight.outputs.max_parallel) }}
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4
      - name: Honor delay when instructed
        run: sleep ${{ needs.preflight.outputs.delay_seconds }}
      - name: Run shard
        run: npm test -- --shard=${{ matrix.shard }}
```

## Baseline semantics

Savings are baseline-aware:

- if `baseline-region` is supplied, ECOBE compares the selected decision against that region
- otherwise ECOBE uses the first entry in `candidate-regions`

This avoids the older behavior where savings were computed against the dirtiest evaluated candidate instead of the caller's declared baseline.

## Outputs

Primary control outputs:

- `decision`
- `reason-code`
- `approved-region`
- `approved-runner-label`
- `delay-seconds`
- `max-parallel`
- `estimated-savings-percent`
- `decision-id`
- `baseline-carbon-intensity`
- `selected-carbon-intensity`
- `signal-confidence`
- `policy-trace`

Legacy compatibility outputs:

- `selected-runner`
- `selected-region`
- `carbon-intensity`
- `baseline`
- `savings`
- `recommendation`

## Fail-closed behavior

When `assurance-mode: true`, ECOBE will deny execution if the route depends on low-confidence fallback signals. The action will exit non-zero by default when `decision=deny`. Set `fail-on-deny: false` only if the workflow should inspect the decision and handle denial itself.
