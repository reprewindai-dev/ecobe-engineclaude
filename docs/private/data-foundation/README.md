# CO2 Router Private Data Foundation Pack

This folder is local-only and gitignored by design.

It contains the production data foundation contracts used to operate the
canonical runtime, formalize medallion storage, govern replay and proof, and
publish internal analytics surfaces.

Files:

- `medallion-data-model.json`
- `declarative-pipeline-contracts.yaml`
- `governance-lineage-audit-spec.md`
- `query-pack.sql`
- `observability-dashboard-spec.md`

Use these files as the implementation contract for Postgres, lakehouse storage,
and catalog governance. Do not publish these files verbatim.
