# ECOBE Dashboard

Real-time carbon intensity monitoring and workload optimization dashboard for ECOBE Engine.

## Features

- **Real-Time Carbon Monitoring** - Live carbon intensity for popular regions
- **Green Routing Optimizer** - Find optimal region based on carbon, latency, cost
- **Energy Calculator** - Estimate carbon footprint for AI workloads
- **DEKES Analytics** - Monitor carbon savings from lead generation optimization
- **Premium UI** - Modern, dark-themed interface with live updates

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Data Fetching**: TanStack Query (React Query)
- **Charts**: Recharts
- **Icons**: Lucide React
- **API**: ECOBE Engine REST API

## Quick Start

### Prerequisites

- Node.js 20+
- Running ECOBE Engine (backend API)

### Installation

```bash
# Clone and navigate
cd ecobe-dashboard

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your ECOBE Engine API URL

# Start development server
npm run dev
```

Dashboard runs at http://localhost:3001

## Environment Variables

```env
# ECOBE Engine API URL
NEXT_PUBLIC_ECOBE_API_URL=http://localhost:3000
ECOBE_API_URL=http://localhost:3000
```

## Dashboard Pages

### Overview
- Live carbon intensity cards for popular regions
- Color-coded by carbon level (low/medium/high)
- Real-time status indicator
- About section with key features

### Green Routing
- Multi-region selection
- Weight sliders for carbon/latency/cost optimization
- Real-time routing recommendations
- Alternative region rankings

### Energy Calculator
- Workload type selection (inference/training/batch)
- Model size configuration
- Carbon budget tracking
- Ranked region recommendations with scores

### DEKES Analytics
- Total workloads optimized
- Total CO₂ saved
- Average carbon intensity
- Recent workload history
- Environmental impact visualization

## Development

```bash
# Type check
npm run type-check

# Lint
npm run lint

# Build for production
npm run build

# Start production server
npm start
```

## Production Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project to Vercel
3. Set environment variable:
   - `NEXT_PUBLIC_ECOBE_API_URL`: Your ECOBE Engine URL
4. Deploy

### Docker

```bash
# Build image
docker build -t ecobe-dashboard .

# Run container
docker run -p 3001:3000 --env-file .env ecobe-dashboard
```

### Dockerfile

```dockerfile
FROM node:20-alpine AS base

# Dependencies
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Builder
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT 3000
CMD ["node", "server.js"]
```

## API Integration

Dashboard connects to ECOBE Engine API:

```typescript
// Energy Equation
POST /api/v1/energy/equation

// Green Routing
POST /api/v1/route/green

// DEKES Optimization
POST /api/v1/dekes/optimize
POST /api/v1/dekes/schedule
GET  /api/v1/dekes/analytics
```

## Component Structure

```
src/
├── app/
│   ├── layout.tsx           # Root layout with header/footer
│   ├── page.tsx             # Main dashboard page
│   ├── providers.tsx        # React Query provider
│   └── globals.css          # Global styles
├── components/
│   ├── CarbonIntensityCard.tsx  # Live carbon display
│   ├── GreenRoutingForm.tsx     # Routing optimizer
│   ├── EnergyCalculator.tsx     # Energy estimation
│   └── DekesStats.tsx           # DEKES analytics
├── lib/
│   └── api.ts               # ECOBE Engine API client
└── types/
    └── index.ts             # TypeScript types
```

## Color Scheme

```
Carbon Levels:
- Low    (<200):  Emerald (#10b981) - Excellent time for workloads
- Medium (200-400): Amber (#f59e0b) - Moderate intensity
- High   (>400):  Red (#ef4444) - Consider delaying

Background:
- Primary:   Slate 950 (#020617)
- Secondary: Slate 900 (#0f172a)
- Border:    Slate 800 (#1e293b)

Accent:
- Success: Emerald 500 (#10b981)
- Warning: Amber 500 (#f59e0b)
- Error:   Red 500 (#ef4444)
```

## Data Refresh Intervals

- Health check: 30 seconds
- Carbon intensity: 5 minutes
- DEKES analytics: 1 minute
- React Query stale time: 1 minute

## Browser Support

- Chrome/Edge: Latest 2 versions
- Firefox: Latest 2 versions
- Safari: Latest 2 versions

## Performance

- Lighthouse Score: 95+
- First Contentful Paint: <1.5s
- Time to Interactive: <3s
- Total Bundle Size: <200KB

## Future Enhancements

- [ ] Historical carbon intensity charts
- [ ] Region comparison tool
- [ ] Custom alert thresholds
- [ ] Export reports to PDF
- [ ] WebSocket for real-time updates
- [ ] Mobile app (React Native)
- [ ] Admin panel for config
- [ ] Multi-user support with auth

## Support

- Issues: GitHub Issues
- Docs: https://docs.ecobe.com
- API: https://api.ecobe.yourdomain.com

---

**Built with sustainability in mind** 🌱

Visualizing carbon data to optimize for a greener future.
