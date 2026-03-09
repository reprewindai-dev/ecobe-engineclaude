# CO₂ Router

**Carbon-aware compute routing and scheduling.**

Route workloads to cleaner energy grids automatically.

> Most carbon-aware schedulers pick the lowest number. CO₂ Router picks the lowest **defensible** number.

Before routing a workload, CO₂ Router validates the signal — checking provider agreement, data freshness, forecast resolution, and fallback state. Every decision ships with a confidence tier, a carbon delta, and a forecast stability rating so the system can be audited, not just trusted. When providers disagree or data goes stale, CO₂ Router downgrades the decision quality rather than silently proceeding.

The result: routing decisions that are explainable, reproducible, and policy-aware.

## Platform Architecture

```
CO₂ Router Platform
├── CO₂ Router Engine       (this service)
├── EmissionCast Forecast   (48h grid intensity forecasting)
├── Carbon Provider Router  (Electricity Maps · Ember · WattTime)
├── Scheduler               (optimal execution window finder)
└── Carbon Budgets          (per-org spend tracking & governance)
```

## Core Capabilities

- **Carbon-Aware Routing** — Multi-factor scoring (carbon 50%, cost 30%, latency 20%)
- **Real-Time Grid Data** — Electricity Maps API integration across 100+ zones
- **EmissionCast Forecasting** — 48h ahead carbon intensity prediction
- **Multi-Provider Validation** — Cross-checks Electricity Maps, Ember Climate, WattTime
- **Carbon Budgets** — Per-org budget enforcement with governance audit trail
- **Carbon Credits** — Automated offset tracking and retirement
- **CI Integration** — Block deploys that exceed carbon thresholds

## Tech Stack

- **Runtime**: Node.js 20 / Express / TypeScript
- **Database**: PostgreSQL + Prisma ORM
- **Cache**: Redis
- **Deployment**: Docker / Railway / Back4App Containers
- **Carbon APIs**: Electricity Maps, Ember Climate, WattTime

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL
- Redis
- Electricity Maps API key (optional in dev)

### Installation

```bash
git clone <repo>
cd co2router

npm install

cp .env.example .env
# Edit .env with your values

docker-compose up -d          # start Postgres + Redis

npm run prisma:generate
npm run prisma:migrate:deploy

npm run dev
```

Server: `http://localhost:3000`

## Environment Variables

```env
PORT=3000
NODE_ENV=development

# Required
DATABASE_URL=postgresql://user:pass@localhost:5432/co2router
REDIS_URL=redis://localhost:6379

# API key protecting all /api/v1 routes
CO2ROUTER_API_KEY=your-secret-key

# Carbon data providers (at least one recommended)
ELECTRICITY_MAPS_API_KEY=your_em_key
EMBER_ENERGY_API_KEY=your_ember_key

# Provider orchestration
CARBON_PROVIDER_PRIMARY=electricity_maps      # electricity_maps | ember | watttime
CARBON_PROVIDER_VALIDATION=ember             # optional cross-check provider
CARBON_PROVIDER_ALLOW_FALLBACK=true

# Forecast worker
FORECAST_REFRESH_ENABLED=true
FORECAST_REFRESH_CRON=*/30 * * * *
```

## API Reference

### Health
```
GET /health
GET /api/v1/health
```

### Routing Engine
```
POST /api/v1/route/green
```
```json
{
  "preferredRegions": ["FR", "DE", "US-CAL-CISO"],
  "maxCarbonGPerKwh": 400,
  "latencyMsByRegion": { "FR": 80, "DE": 60, "US-CAL-CISO": 140 },
  "carbonWeight": 0.5,
  "latencyWeight": 0.3,
  "costWeight": 0.2
}
```
Response: ranked region list with carbon intensity, score, and routing rationale.

### Energy Equation
```
POST /api/v1/energy/equation
```
Estimates workload carbon footprint across candidate regions.

### EmissionCast Forecasting
```
GET  /api/v1/forecasting/regions
POST /api/v1/forecasting/scorecards
GET  /api/v1/forecasting/accuracy/:zone
```

### Carbon Budgets
```
POST /api/v1/budgets
GET  /api/v1/budgets/:orgId
POST /api/v1/budgets/:orgId/check
```

### Carbon Credits
```
POST /api/v1/credits/purchase
POST /api/v1/credits/retire
GET  /api/v1/credits/balance/:orgId
POST /api/v1/credits/auto-offset
```

### Methodology (public, no auth)
```
GET /api/v1/methodology
```
Machine-readable model card: scoring formula, provider roles, uncertainty model, backtest results.

### CI Integration
```
POST /api/v1/ci/check          — evaluate a deploy against carbon thresholds
GET  /api/v1/ci/health
```

## Scoring Formula

```
score = wC × (1 − ci/maxCI) + wL × (1 − lat/maxLat) + wCo × (1 − cost/maxCost)
```

All three objectives normalized 0–1 across candidates. Higher = better.
Default weights: carbon `0.5` · cost `0.3` · latency `0.2`.
Callers may override weights per request.

## Database Models

| Model | Purpose |
|---|---|
| `CarbonIntensity` | Real-time grid intensity records |
| `CarbonForecast` | 48h forward predictions per zone |
| `RoutingDecision` | Every routing choice + score breakdown |
| `CarbonBudget` | Per-org budget configuration |
| `CarbonCredit` | Offset credit inventory |
| `EmissionLog` | Full emissions audit trail |

## Development

```bash
npm test                # Jest test suite
npm run type-check      # tsc --noEmit
npm run lint            # ESLint
npm run format          # Prettier
```

## Deployment

### Docker
```bash
docker build -t co2router .
docker run -p 3000:3000 --env-file .env co2router
```

### Railway / Back4App
See `railway.json` and `BACK4APP.md` for platform-specific configuration.

## License

MIT

---

**co2router.com** — Route workloads to cleaner grids, automatically.
