# CO2 Router Kubernetes Enforcement Bundle

This bundle was generated from the same deterministic policy engine used for live CO2 Router authorization.

- Decision frame: `df-1775361884194`
- Binding action: `reroute`
- Approved region: `eu-west-1`
- Policy profile: `default`
- Criticality: `standard`

Files:

- `bundle.json`: raw machine-readable enforcement payload
- `gatekeeper-template.yaml`: ConstraintTemplate derived from the decision frame
- `gatekeeper-constraint.yaml`: matching Gatekeeper constraint
- `sample-workload.yaml`: example governed workload manifest carrying the required labels and annotations

Apply with:

```bash
kubectl apply -f gatekeeper-template.yaml
kubectl apply -f gatekeeper-constraint.yaml
kubectl apply -f sample-workload.yaml
```
