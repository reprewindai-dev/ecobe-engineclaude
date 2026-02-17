# ECOBE Engine

**Environmental Carbon and Optimization Backend Engine**

Real-time carbon emissions monitoring and optimization platform for green computing.

## Features

### Core Capabilities
- 🌍 **Real-Time Carbon Monitoring** - Electricity Maps API integration
- 🎯 **Smart Green Routing** - Multi-factor optimization (carbon, latency, cost)
- ⚡ **Energy Equation Calculator** - Estimate workload carbon footprint
- 📊 **Carbon Forecasting** - ML-based prediction (moat feature)
- 🔗 **DEKES Integration** - Optimize lead generation workloads
- 💳 **Carbon Credits Tracking** - Automated offset calculations
- 📈 **Real-Time Analytics** - Live carbon intensity monitoring

### Innovation & Moat
1. **Predictive Carbon Forecasting** - ML model predicts grid intensity 48h ahead
2. **Dual Optimization** - Cost + carbon scoring (not just carbon)
3. **DEKES Workload Integration** - Carbon-aware batch scheduling
4. **Optimal Window Finding** - Smart scheduling for lowest carbon
5. **Historical Pattern Learning** - Improves over time

## Tech Stack

- **Backend**: Node.js/Express with TypeScript
- **Database**: PostgreSQL (primary) + Redis (caching)
- **Deployment**: Docker + Back4App Containers
- **APIs**: Electricity Maps API
- **ML**: Time-series forecasting for carbon prediction

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL
- Redis
- Electricity Maps API key (optional for dev)

### Installation

```bash
# Clone repository
git clone <repo>
cd ecobe-engine

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your values

# Start local services
docker-compose up -d

# Generate Prisma client
npm run prisma:generate

# Push database schema
npx prisma db push

# Start development server
npm run dev
```

Server runs at http://localhost:3000

## Environment Variables

```env
PORT=3000
NODE_ENV=development

# Required
DATABASE_URL=postgresql://ecobe:ecobe@localhost:5432/ecobe
REDIS_URL=redis://localhost:6379

# Electricity Maps (optional for dev)
ELECTRICITY_MAPS_API_KEY=your_key_here
ELECTRICITY_MAPS_BASE_URL=https://api.electricitymap.org
DEFAULT_MAX_CARBON_G_PER_KWH=400

# DEKES Integration (optional)
DEKES_API_URL=http://localhost:3000
DEKES_API_KEY=your_dekes_key
```

## API Reference

### Health Check
```bash
GET /health
```

### Energy Equation
Calculate carbon footprint for workload.

```bash
POST /api/v1/energy/equation
Content-Type: application/json

{
  "requestVolume": 1000,
  "workloadType": "inference",
  "modelSize": "mixtral-70b",
  "regionTargets": ["US-CAL-CISO", "FR", "DE"],
  "carbonBudget": 1000000,
  "deadlineWindow": {
    "start": "2026-02-12T00:00:00.000Z",
    "end": "2026-02-12T01:00:00.000Z"
  },
  "hardwareMix": {
    "cpu": 0.6,
    "gpu": 0.3,
    "tpu": 0.1
  }
}
```

**Response:**
```json
{
  "routingRecommendation": [
    {
      "region": "FR",
      "rank": 1,
      "carbonIntensity": 58,
      "estimatedCO2": 2320,
      "estimatedEnergyKwh": 0.04,
      "score": 0.95
    }
  ],
  "regionEstimates": [...],
  "totalEstimatedCO2": 2320,
  "withinBudget": true
}
```

### Green Routing
Get optimal region for workload.

```bash
POST /api/v1/route/green
Content-Type: application/json

{
  "preferredRegions": ["FR", "DE", "US-CAL-CISO"],
  "maxCarbonGPerKwh": 400,
  "latencyMsByRegion": {
    "FR": 80,
    "DE": 60,
    "US-CAL-CISO": 140
  },
  "carbonWeight": 0.5,
  "latencyWeight": 0.3,
  "costWeight": 0.2
}
```

**Response:**
```json
{
  "selectedRegion": "FR",
  "carbonIntensity": 58,
  "estimatedLatency": 80,
  "score": 0.92,
  "alternatives": [
    {
      "region": "DE",
      "carbonIntensity": 120,
      "score": 0.85
    }
  ]
}
```

## Carbon Credits Tracking

ECOBE includes a complete carbon credits management system:

```bash
# Purchase carbon credits
POST /api/v1/credits/purchase
Content-Type: application/json

{
  "organizationId": "org_123",
  "amountCO2": 10000,
  "provider": "Gold Standard",
  "priceUsd": 150,
  "certificateUrl": "https://registry.goldstandard.org/cert/123"
}

# Retire credits (offset emissions)
POST /api/v1/credits/retire
Content-Type: application/json

{
  "creditIds": ["cred_123", "cred_456"],
  "reason": "Q4 emissions offset",
  "workloadRequestId": "wl_789"
}

# List credits
GET /api/v1/credits?organizationId=org_123&status=ACTIVE

# Get carbon balance
GET /api/v1/credits/balance/org_123

# Auto-offset to target percentage
POST /api/v1/credits/auto-offset
Content-Type: application/json

{
  "organizationId": "org_123",
  "targetOffsetPercentage": 100
}
```

**Response:**
```json
{
  "organizationId": "org_123",
  "availableCO2": 50000,
  "totalEmissions": 125000,
  "totalOffset": 75000,
  "netEmissions": 50000,
  "offsetPercentage": 60,
  "credits": {
    "active": 5,
    "totalValue": 750
  }
}
```

## DEKES Integration

ECOBE optimizes DEKES lead generation workloads for minimal carbon:

```typescript
import { dekesIntegration } from './lib/dekes-integration'

// Optimize single query
const result = await dekesIntegration.optimizeQuery(
  {
    id: 'query_123',
    query: 'sustainable tech companies',
    estimatedResults: 500
  },
  10000,  // Carbon budget (gCO2eq)
  ['US-CAL-CISO', 'FR', 'DE']
)

// Schedule batch queries for lowest carbon window
const schedule = await dekesIntegration.scheduleBatchQueries(
  queries,
  regions,
  24  // Look ahead 24 hours
)
```

## Carbon Forecasting (ML Moat)

Predict future carbon intensity:

```typescript
import { forecastCarbonIntensity, findOptimalWindow } from './lib/carbon-forecasting'

// Get 24h forecast
const forecasts = await forecastCarbonIntensity('US-CAL-CISO', 24)

// Find optimal execution window
const window = await findOptimalWindow(
  'US-CAL-CISO',
  4,  // Duration hours
  48  // Look ahead hours
)

console.log(`Best window: ${window.startTime}`)
console.log(`Savings: ${window.savings}% vs immediate`)
```

## Production Deployment

### Docker

```bash
# Build image
docker build -t ecobe-engine .

# Run container
docker run -p 3000:3000 --env-file .env ecobe-engine
```

### Back4App Containers

See [BACK4APP.md](./BACK4APP.md) for detailed deployment instructions.

### GitHub Actions

CI/CD pipeline automatically:
- Builds Docker image
- Pushes to GHCR
- Deploys to Back4App on main branch

## Architecture

```
┌─────────────────────────────────────────┐
│     Electricity Maps API                │
│     (Real-time carbon data)             │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│     ECOBE Engine                        │
│  ┌─────────────────────────────────┐   │
│  │  Carbon Forecasting (ML)        │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │  Green Routing Algorithm        │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │  Energy Equation Calculator     │   │
│  └─────────────────────────────────┘   │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│     DEKES Lead Generation               │
│     (Optimized workload execution)      │
└─────────────────────────────────────────┘
```

## Database Schema

- **CarbonIntensity** - Real-time carbon data
- **WorkloadRequest** - Workload optimization records
- **RoutingDecision** - Routing decisions & scores
- **CarbonForecast** - ML predictions
- **DekesWorkload** - DEKES integration tracking
- **CarbonCredit** - Carbon offset management
- **EmissionLog** - All emissions logged
- **Region** - Supported regions metadata

## Monitoring

### Key Metrics
- Total carbon saved (gCO2eq)
- Average carbon intensity
- Workloads optimized
- Cost savings
- Forecast accuracy

### Health Checks
```bash
# Application health
curl http://localhost:3000/health

# Database connection
psql $DATABASE_URL -c "SELECT 1"

# Redis connection
redis-cli ping
```

## Development

```bash
# Run tests
npm test

# Type check
npx tsc --noEmit

# Format code
npm run format

# Lint
npm run lint
```

## Future Enhancements

### Phase 2
- [ ] LSTM neural network for forecasting
- [ ] Weather API integration
- [ ] Multi-cloud optimization (AWS/GCP/Azure)
- [ ] Real-time dashboard (React)
- [ ] GraphQL API
- [ ] WebSocket for live updates

### Phase 3
- [ ] Automated carbon offsetting
- [ ] Sustainability reporting
- [ ] API rate limiting & auth
- [ ] Multi-region deployment
- [ ] Load balancing
- [ ] Kubernetes deployment

## Contributing

1. Fork repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request

## License

MIT

## Support

- Issues: GitHub Issues
- Email: support@ecobe.com
- Docs: https://docs.ecobe.com

---

**Built for a sustainable future** 🌱

Optimizing workloads for minimal carbon impact.
