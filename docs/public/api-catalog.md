# ECOBE API Catalog

This catalog describes the public SaaS surface and the brokered engine bridge that powers the live control plane.

## How to use it

- Send JSON over `POST` requests with `content-type: application/json`.
- Read endpoints are `GET` unless noted.
- Protected routes require the platform auth layer or broker auth headers.
- `404` means the route is not exposed.
- `401` or `403` means the route exists but is intentionally protected.

## Public SaaS API

These endpoints live under `https://<your-runtime>/api/v1/...`.

### Health and readiness

- `GET /api/v1/health`
  - Returns engine health, dependency health, provider readiness, and runtime metadata.
- `GET /api/v1/ready`
  - Readiness gate for deployment and load balancers.
- `GET /api/v1/bootstrap`
  - Bootstraps the runtime with initial provisioning data.

### Dashboard and overview

- `GET /api/v1/dashboard/overview`
  - Summary dashboard payload for the control plane.
- `GET /api/v1/public/overview`
  - Public-facing summary of the product surface.
- `GET /api/v1/usage`
  - Per-org usage and quota state.

### Runs and replay

- `GET /api/v1/runs`
  - Lists execution runs.
- `POST /api/v1/runs`
  - Creates a new run.
- `GET /api/v1/runs/:id`
  - Fetches a single run.
- `GET /api/v1/runs/:id/events`
  - Fetches run events.

### Policies and approvals

- `GET /api/v1/policies`
  - Lists policy definitions.
- `POST /api/v1/policies`
  - Creates or updates a policy.
- `GET /api/v1/approvals`
  - Lists approval records.
- `POST /api/v1/approvals`
  - Creates an approval request.
- `GET /api/v1/approvals/:id`
  - Fetches one approval record.

### Billing

- `POST /api/v1/billing/checkout`
  - Creates a private checkout session.
- `POST /api/v1/billing/public-checkout`
  - Creates a public checkout session.
- `POST /api/v1/billing/portal`
  - Opens the billing portal.
- `GET /api/v1/billing/status`
  - Returns billing and subscription status.
- `POST /api/v1/billing/invoices/preview`
  - Returns a draft invoice estimate.
- `POST /api/v1/billing/invoices/generate`
  - Generates an invoice.
- `POST /api/v1/billing/webhook`
  - Receives billing provider webhooks.

### Access control

- `GET /api/v1/keys`
  - Lists API keys for the org.
- `GET /api/v1/service-accounts`
  - Lists service accounts.
- `POST /api/v1/service-accounts`
  - Creates a service account.
- `GET /api/v1/service-accounts/:id`
  - Fetches one service account.

### Compliance and audit

- `GET /api/v1/compliance/reports`
  - Lists compliance reports.
- `POST /api/v1/compliance/reports`
  - Creates a compliance report.
- `GET /api/v1/compliance/reports/:id`
  - Fetches one compliance report.
- `GET /api/v1/audit/exports`
  - Lists export jobs.
- `POST /api/v1/audit/exports`
  - Creates an export job.
- `GET /api/v1/audit/exports/:id`
  - Fetches one export job.

### Operations

- `GET /api/v1/alerts`
  - Lists active alerts.
- `GET /api/v1/health`
  - Health check for the runtime.
- `GET /api/v1/methodology/providers`
  - Lists provider methodology metadata.
- `POST /api/v1/admin/maintenance/normalize-policies`
  - Runs policy normalization.
- `POST /api/v1/webhooks`
  - Registers a webhook endpoint.
- `GET /api/v1/webhooks/deliveries`
  - Lists webhook delivery attempts.

## Brokered engine bridge

The broker route on the runtime forwards allowlisted paths to the internal engine with injected auth.

- `GET|POST|PUT|PATCH|DELETE /api/v1/*`
  - Only allowlisted engine paths are forwarded.
  - Blocked paths include engine internals, org management, doctrine, and event outboxes.
  - The broker injects `Authorization`, `x-ecobe-internal-key`, and related headers.

## High-value engine endpoints exposed through the broker

- `GET /api/v1/health`
  - Engine health and provider readiness.
- `POST /api/v1/route/green`
  - Core green routing decision.
- `POST /api/v1/route`
  - Compatibility routing endpoint.
- `POST /api/v1/route-simple`
  - Simplified routing endpoint for testing.
- `GET /api/v1/intelligence/grid/hero-metrics`
  - Hero KPIs for the dashboard.
- `GET /api/v1/intelligence/grid/summary`
  - Regional grid summary.
- `GET /api/v1/intelligence/grid/opportunities`
  - Curtailment and spike opportunity feed.
- `GET /api/v1/intelligence/grid/region/:region`
  - Region detail and history.
- `GET /api/v1/intelligence/grid/import-leakage`
  - Import leakage analysis.
- `GET /api/v1/intelligence/grid/audit/:region`
  - Audit trail for a region.
- `GET /api/v1/intelligence/grid/structural-profile/:region`
  - Ember structural validation profile.
- `GET /api/v1/dashboard/metrics`
  - Dashboard metrics payload.
- `GET /api/v1/dashboard/regions`
  - Dashboard regional status payload.
- `POST /api/v1/ci/authorize`
  - CI/CD authorization decision.

## Response discipline

- Successful responses return JSON only.
- Nulls are allowed where the source data is unavailable.
- Estimated, synthetic, fallback, and disagreement states must remain visible in responses and replay payloads.
- Do not use direct engine URLs from clients. Use the broker or the public SaaS API.
