# CO2 Router Environment Manifest

## Canonical sources
- Engine env contract: `ecobe-engine/src/config/env.ts`
- Engine example file: `ecobe-engine/.env.example`
- Dashboard example file: `ecobe-dashboard/.env.example`

## Engine required in production
| Variable | Purpose | Secret | Notes |
|---|---|---:|---|
| `DATABASE_URL` | Prisma runtime connection | yes | Required |
| `REDIS_URL` | Redis cache and worker state | yes | Required |
| `ECOBE_INTERNAL_API_KEY` | Internal engine auth for dashboard trace/replay and verifier routes | yes | Required |
| `DECISION_API_SIGNATURE_SECRET` | Authoritative verifier signing secret | yes | Required for signed delivery verification |
| `SEKED_POLICY_ADAPTER_ENABLED` | Activates governance path | no | Set `true` for doctrine-complete runtime |

## Engine strongly recommended in production
| Variable | Purpose | Secret | Recommended value |
|---|---|---:|---|
| `DIRECT_DATABASE_URL` | Direct migration connection | yes | Set |
| `UI_ENABLED` | Internal HTML UI gate | no | `false` unless explicitly used |
| `UI_TOKEN` | Admin UI auth | yes | Set if `UI_ENABLED=true` |
| `ENGINE_BACKGROUND_WORKERS_ENABLED` | Worker boot control | no | `true` |
| `DECISION_EVENT_SIGNATURE_SECRET` | Legacy event signing alias | yes | Optional fallback if API signing secret is unset |
| `SEKED_POLICY_ADAPTER_URL` | Remote SEKED authority URL | yes | Leave blank for internal mode |
| `EXTERNAL_POLICY_HOOK_ENABLED` | Remote external policy hook | no | `false` unless real authority exists |
| `OTEL_EXPORT_ENABLED` | OTLP export toggle | no | `true` in monitored prod |
| `OTEL_EXPORT_ENDPOINT` | OTLP collector endpoint | yes | Set when OTEL is enabled |

## Engine provider credentials
| Variable | Purpose | Secret |
|---|---|---:|
| `WATTTIME_USERNAME` | WattTime auth | yes |
| `WATTTIME_PASSWORD` | WattTime auth | yes |
| `GRIDSTATUS_API_KEY` | GridStatus access | yes |
| `EIA_API_KEY` | EIA-930 access | yes |
| `EMBER_API_KEY` | Ember access | yes |
| `FINGRID_API_KEY` | Finland provider access | yes |
| `ELECTRICITY_MAPS_API_KEY` | Electricity Maps access | yes |

## Engine caches, workers, and schedulers
| Variable | Purpose | Default |
|---|---|---|
| `GRID_SIGNAL_CACHE_TTL` | Routing cache TTL | `900` |
| `GRID_FEATURE_CACHE_TTL` | Feature cache TTL | `3600` |
| `EIA_INGESTION_SCHEDULE` | EIA ingestion schedule | `0 */15 * * * *` |
| `EIA_BACKFILL_ENABLED` | EIA backfill toggle | `true` |
| `FORECAST_REFRESH_ENABLED` | Forecast poller toggle | derived false if unset |
| `FORECAST_REFRESH_CRON` | Forecast poller schedule | `*/30 * * * *` |
| `LEARNING_LOOP_ENABLED` | Learning loop toggle | derived false if unset |
| `LEARNING_LOOP_CRON` | Learning loop schedule | `*/15 * * * *` |
| `LEARNING_LOOKBACK_HOURS` | Learning lookback window | `168` |
| `RUNTIME_SUPERVISOR_ENABLED` | Runtime supervisor toggle | derived false if unset |
| `RUNTIME_SUPERVISOR_INTERVAL_SEC` | Supervisor cadence | `60` |
| `SUPERVISOR_FORECAST_STALE_MIN` | Forecast stale threshold | `90` |
| `SUPERVISOR_INTELLIGENCE_STALE_MIN` | Intelligence stale threshold | `90` |
| `SUPERVISOR_LEARNING_STALE_MIN` | Learning stale threshold | `120` |
| `SUPERVISOR_DECISION_EVENT_STALE_MIN` | Outbox stale threshold | `30` |

## Engine event dispatch
| Variable | Purpose | Default |
|---|---|---|
| `DECISION_EVENT_DISPATCH_ENABLED` | Outbox dispatcher toggle | derived false if unset |
| `DECISION_EVENT_DISPATCH_CRON` | Dispatch cadence | `*/20 * * * * *` |
| `DECISION_EVENT_DISPATCH_BATCH_SIZE` | Batch size | `25` |
| `DECISION_EVENT_DISPATCH_TIMEOUT_MS` | Per-dispatch timeout | `3000` |
| `DECISION_EVENT_MAX_ATTEMPTS` | Retry cap | `5` |
| `DECISION_EVENT_RETRY_BASE_MS` | Retry backoff base | `1000` |
| `DECISION_EVENT_ALERT_LAG_MINUTES` | Lag alert threshold | `10` |
| `DECISION_EVENT_ALERT_FAILURE_RATE_PCT` | Failure alert threshold | `20` |
| `DECISION_EVENT_ALERT_DEADLETTER_COUNT` | Dead-letter alert threshold | `25` |

## Engine commercial and integration env
| Variable | Purpose | Secret |
|---|---|---:|
| `DEKES_API_KEY` | DEKES SaaS integration auth | yes |
| `DEKES_WEBHOOK_URL` | DEKES callback target | yes |
| `DEKES_WEBHOOK_SECRET` | DEKES webhook verification | yes |
| `JWT_SECRET` | Future tenant auth | yes |
| `STRIPE_SECRET_KEY` | Billing | yes |
| `STRIPE_WEBHOOK_SECRET` | Billing | yes |
| `STRIPE_GROWTH_MONTHLY_PRICE_ID` | Billing product id | no |
| `STRIPE_GROWTH_ANNUAL_PRICE_ID` | Billing product id | no |
| `STRIPE_ENTERPRISE_PRICE_ID` | Billing product id | no |

## Dashboard env
| Variable | Purpose | Secret | Notes |
|---|---|---:|---|
| `ECOBE_API_URL` | Engine base URL for server-side dashboard composition | no | Required in production |
| `ECOBE_INTERNAL_API_KEY` | Enables dashboard trace/replay/internal routes | yes | Required for full command center truth |
| `NEXT_PUBLIC_ECOBE_API_URL` | Optional direct browser engine URL | no | Leave unset unless intentionally bypassing proxy |
| `CO2ROUTER_API_URL` | Accepted alias in `engine.ts` | no | Optional |
| `CO2ROUTER_INTERNAL_API_KEY` | Accepted alias in `engine.ts` | yes | Optional |

## Canonical production posture
- `SEKED_POLICY_ADAPTER_ENABLED=true`
- `SEKED_POLICY_ADAPTER_URL=` blank to use internal mode
- `EXTERNAL_POLICY_HOOK_ENABLED=false` until a real external authority exists
- Engine auto-provisions a system-managed self-verifier sink at boot when `ECOBE_INTERNAL_API_KEY` and a decision signing secret are present
- Dashboard must have both `ECOBE_API_URL` and `ECOBE_INTERNAL_API_KEY`
