# Back4App Deployment Guide

Complete guide to deploying ECOBE Engine on Back4App Containers.

## Prerequisites

1. **Back4App Account**
   - Sign up at https://www.back4app.com/
   - Verify email and complete setup

2. **Back4App CLI**
   ```bash
   npm install -g back4app-cli
   ```

3. **GitHub Container Registry** (GHCR)
   - Personal access token with `write:packages` permission
   - Repository configured for GHCR

4. **Environment Variables**
   - Electricity Maps API key
   - Database URL (managed PostgreSQL)
   - Redis URL (managed Redis)

## Step 1: Prepare Environment

### 1.1 Create Container App

1. Log into Back4App Console
2. Navigate to **Containers** → **Create Container**
3. Configure:
   - **Name**: `ecobe-engine`
   - **Plan**: Select based on usage (Hobby/Starter/Growth)
   - **Region**: Choose closest to your users

### 1.2 Provision Database

1. Navigate to **Add-ons** → **PostgreSQL**
2. Create new PostgreSQL database:
   - **Name**: `ecobe-db`
   - **Plan**: Starter (10GB storage, 1GB RAM)
   - **Region**: Same as container
3. Note the connection string: `postgres://user:pass@host:5432/db`

### 1.3 Provision Redis

1. Navigate to **Add-ons** → **Redis**
2. Create new Redis instance:
   - **Name**: `ecobe-redis`
   - **Plan**: Starter (256MB)
   - **Region**: Same as container
3. Note the connection string: `redis://host:6379`

## Step 2: Configure GitHub Actions

### 2.1 Repository Secrets

Add these secrets to your GitHub repository:

```
BACK4APP_API_KEY          # From Back4App Console → API → Create Key
BACK4APP_CONTAINER_ID     # From Container Settings → Container ID
GHCR_TOKEN               # GitHub personal access token
ELECTRICITY_MAPS_API_KEY # From Electricity Maps
DATABASE_URL             # PostgreSQL connection string
REDIS_URL                # Redis connection string
```

### 2.2 GitHub Actions Workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Back4App

on:
  push:
    branches: [main]
  workflow_dispatch:

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}/ecobe-engine

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GHCR_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=sha,prefix={{branch}}-
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}

      - name: Deploy to Back4App
        env:
          BACK4APP_API_KEY: ${{ secrets.BACK4APP_API_KEY }}
          BACK4APP_CONTAINER_ID: ${{ secrets.BACK4APP_CONTAINER_ID }}
        run: |
          curl -X POST \
            https://api.back4app.com/containers/$BACK4APP_CONTAINER_ID/deploy \
            -H "Authorization: Bearer $BACK4APP_API_KEY" \
            -H "Content-Type: application/json" \
            -d '{
              "image": "${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest",
              "env": {
                "NODE_ENV": "production",
                "PORT": "3000",
                "DATABASE_URL": "${{ secrets.DATABASE_URL }}",
                "REDIS_URL": "${{ secrets.REDIS_URL }}",
                "ELECTRICITY_MAPS_API_KEY": "${{ secrets.ELECTRICITY_MAPS_API_KEY }}",
                "ELECTRICITY_MAPS_BASE_URL": "https://api.electricitymap.org",
                "DEFAULT_MAX_CARBON_G_PER_KWH": "400"
              }
            }'
```

## Step 3: Database Setup

### 3.1 Apply Schema

After container is created, apply Prisma schema:

```bash
# Install Back4App CLI globally if not done
npm install -g back4app-cli

# Login
back4app login

# Connect to your container
back4app container:connect ecobe-engine

# Run migrations
npx prisma db push
```

### 3.2 Seed Initial Data

Create `prisma/seed.ts`:

```typescript
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Seed regions
  const regions = [
    { code: 'US-CAL-CISO', name: 'California (US)', country: 'US', timezone: 'America/Los_Angeles' },
    { code: 'FR', name: 'France', country: 'FR', timezone: 'Europe/Paris' },
    { code: 'DE', name: 'Germany', country: 'DE', timezone: 'Europe/Berlin' },
    { code: 'GB', name: 'United Kingdom', country: 'GB', timezone: 'Europe/London' },
    { code: 'SE', name: 'Sweden', country: 'SE', timezone: 'Europe/Stockholm' },
    { code: 'NO', name: 'Norway', country: 'NO', timezone: 'Europe/Oslo' },
    { code: 'BR', name: 'Brazil', country: 'BR', timezone: 'America/Sao_Paulo' },
    { code: 'JP', name: 'Japan', country: 'JP', timezone: 'Asia/Tokyo' },
    { code: 'AU-NSW', name: 'New South Wales (AU)', country: 'AU', timezone: 'Australia/Sydney' },
    { code: 'SG', name: 'Singapore', country: 'SG', timezone: 'Asia/Singapore' },
  ]

  for (const region of regions) {
    await prisma.region.upsert({
      where: { code: region.code },
      update: region,
      create: region,
    })
  }

  console.log('✅ Regions seeded')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
```

Run seed:

```bash
npx prisma db seed
```

## Step 4: Container Configuration

### 4.1 Environment Variables

Set in Back4App Console → Container → Environment:

```env
NODE_ENV=production
PORT=3000

# Database
DATABASE_URL=<postgres-connection-string>
REDIS_URL=<redis-connection-string>

# Electricity Maps
ELECTRICITY_MAPS_API_KEY=<your-api-key>
ELECTRICITY_MAPS_BASE_URL=https://api.electricitymap.org
DEFAULT_MAX_CARBON_G_PER_KWH=400

# DEKES Integration (optional)
DEKES_API_URL=https://dekes-api.yourdomain.com
DEKES_API_KEY=<your-dekes-key>
```

### 4.2 Health Check

Configure health check endpoint:
- **Path**: `/health`
- **Port**: `3000`
- **Interval**: `30s`
- **Timeout**: `5s`
- **Retries**: `3`

### 4.3 Resource Limits

Recommended settings:
- **Memory**: 512MB (Starter) / 1GB (Growth)
- **CPU**: 1 core (Starter) / 2 cores (Growth)
- **Auto-scaling**: Enable for production
  - Min instances: 1
  - Max instances: 3
  - Scale up at: 80% CPU/Memory
  - Scale down at: 40% CPU/Memory

## Step 5: Domain Configuration

### 5.1 Custom Domain

1. Navigate to **Containers** → **Domains**
2. Add custom domain: `api.ecobe.yourdomain.com`
3. Configure DNS:
   ```
   Type: CNAME
   Name: api.ecobe
   Value: <back4app-provided-url>
   ```

4. Enable SSL certificate (automatic via Let's Encrypt)

### 5.2 Update DEKES Integration

Update DEKES SaaS to point to production ECOBE:

```env
# In DEKES .env
ECOBE_API_URL=https://api.ecobe.yourdomain.com
```

## Step 6: Monitoring & Logs

### 6.1 View Logs

```bash
# Real-time logs
back4app logs:tail ecobe-engine

# Historical logs
back4app logs ecobe-engine --since 1h
```

Or via Console → Container → Logs

### 6.2 Metrics Dashboard

Navigate to Container → Metrics to view:
- CPU usage
- Memory usage
- Network traffic
- Request rate
- Response times

### 6.3 Alerts

Set up alerts for:
- High memory usage (>80%)
- High CPU usage (>80%)
- Container restarts
- Health check failures
- Error rate spike

## Step 7: Continuous Deployment

### 7.1 Automatic Deployments

With GitHub Actions configured, deployments happen automatically:

1. Push to `main` branch
2. GitHub Actions builds Docker image
3. Image pushed to GHCR
4. Back4App pulls latest image
5. Zero-downtime deployment
6. Health checks validate deployment

### 7.2 Rollback

If deployment fails:

```bash
# List deployments
back4app deployments:list ecobe-engine

# Rollback to previous
back4app deployments:rollback ecobe-engine <deployment-id>
```

Or via Console → Deployments → Rollback

## Step 8: Production Checklist

- [ ] Database connection pool configured (max 20 connections)
- [ ] Redis cache TTL optimized (15 minutes for carbon data)
- [ ] Rate limiting configured (100 req/min per IP)
- [ ] CORS configured for allowed origins only
- [ ] Electricity Maps API key has sufficient quota
- [ ] Health check responds within 2 seconds
- [ ] Error logging sends to monitoring service
- [ ] Backup strategy configured (daily snapshots)
- [ ] Custom domain configured with SSL
- [ ] Environment variables secured (no hardcoded secrets)
- [ ] Auto-scaling enabled for production traffic
- [ ] Monitoring alerts configured
- [ ] DEKES integration tested end-to-end

## Troubleshooting

### Container Won't Start

Check logs:
```bash
back4app logs ecobe-engine --tail 100
```

Common issues:
- Database connection failed → Verify DATABASE_URL
- Redis connection failed → Verify REDIS_URL
- Port binding error → Ensure PORT=3000 set
- Prisma schema mismatch → Run `prisma db push`

### High Memory Usage

- Check for memory leaks in logs
- Reduce Redis cache size
- Enable connection pooling
- Scale up container resources

### Slow Response Times

- Check Electricity Maps API latency
- Verify Redis caching working (should hit cache 90%+)
- Review database query performance
- Consider CDN for static assets

### Database Connection Errors

- Check connection pool size (default: 10)
- Verify database not at connection limit
- Check network connectivity
- Review connection timeout settings

## Cost Optimization

### Resource Sizing

**Development**:
- Hobby plan: $5/month
- PostgreSQL Starter: $7/month
- Redis Starter: $5/month
- **Total**: ~$17/month

**Production**:
- Starter plan (1 instance): $25/month
- PostgreSQL Growth: $25/month
- Redis Growth: $15/month
- **Total**: ~$65/month

### API Usage

Electricity Maps API:
- Free tier: 1,000 requests/day
- Paid tier: $99/month for 100,000 requests/day

With Redis caching (15-minute TTL):
- 1 region = 96 API calls/day (every 15 min)
- 10 regions = 960 API calls/day
- Stays within free tier for development

## Security Best Practices

1. **API Key Rotation**
   - Rotate Electricity Maps API key every 90 days
   - Store in Back4App secrets, not code

2. **Database Security**
   - Use SSL for database connections
   - Restrict database access to container IP only
   - Enable daily automated backups

3. **Access Control**
   - Restrict Back4App Console access to team only
   - Use API keys with minimal required permissions
   - Enable 2FA on all accounts

4. **Secrets Management**
   - Never commit secrets to Git
   - Use GitHub Secrets for CI/CD
   - Rotate secrets quarterly

## Support

- **Back4App Docs**: https://docs.back4app.com/
- **Back4App Support**: support@back4app.com
- **ECOBE Issues**: GitHub Issues
- **Electricity Maps**: https://api-portal.electricitymaps.com/

---

**Deployment Status**: Production-ready with zero-downtime deploys 🚀

Optimized for green computing with carbon-aware infrastructure.
