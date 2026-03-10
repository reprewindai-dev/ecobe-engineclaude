# ECOBE Engine - Back4App Production Deployment Guide

## ⚠️ CRITICAL - READ BEFORE DEPLOYMENT

This is a **production-grade carbon optimization engine** with multiple API integrations. 
ALL environment variables must be configured in Back4App for successful deployment.

## 🚀 Quick Deployment Steps

### 1. Push to GitHub
```bash
git add .
git commit -m "Add production Docker files"
git push origin main
```

### 2. Back4App Container Setup
1. Go to [Back4App Console](https://console.back4app.com/)
2. Create New Container App
3. Connect your GitHub repository
4. Select the `ecobe-engine` folder

### 3. REQUIRED Environment Variables

Set these in Back4App Container → Settings → Environment Variables:

#### **🔥 CORE REQUIRED (Will crash without these)**
```env
# Database
DATABASE_URL=postgresql://ecobe:ecobe@postgres:5432/ecobe
REDIS_URL=redis://redis:6379

# Carbon Data API
ELECTRICITY_MAPS_API_KEY=your_electricity_maps_api_key
ELECTRICITY_MAPS_BASE_URL=https://api.electricitymap.org
DEFAULT_MAX_CARBON_G_PER_KWH=400

# AI & Intelligence (REQUIRED for ML features)
OPENAI_API_KEY=your_openai_api_key
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Vector Database (REQUIRED for workload similarity)
UPSTASH_VECTOR_REST_URL=your_upstash_vector_url
UPSTASH_VECTOR_REST_TOKEN=your_upstash_vector_token
UPSTASH_VECTOR_INDEX_NAME=ecobe-workloads

# Background Jobs (REQUIRED for intelligence)
QSTASH_TOKEN=your_qstash_token
QSTASH_BASE_URL=https://qstash.upstash.io
QSTASH_CURRENT_SIGNING_KEY=your_qstash_current_key
QSTASH_NEXT_SIGNING_KEY=your_qstash_next_key

# Basic Config
NODE_ENV=production
PORT=3000
```

#### **🔗 OPTIONAL INTEGRATIONS**
```env
# DEKES Lead Generation (if using DEKES)
DEKES_API_URL=https://your-dekes-instance.com
DEKES_API_KEY=your_dekes_api_key

# Dashboard Connection
ECOBE_ENGINE_API_KEY=your_engine_api_key

# Job Scheduling
INTELLIGENCE_JOB_TOKEN=your_intelligence_job_token
INTELLIGENCE_ACCURACY_CRON=*/30 * * * *
INTELLIGENCE_VECTOR_CLEANUP_CRON=0 3 * * *
INTELLIGENCE_CALIBRATION_CRON=15 * * * *

# Features
FORECAST_REFRESH_ENABLED=true
FORECAST_REFRESH_CRON=*/30 * * * *
UI_ENABLED=false
```

## 📊 API Keys You Need to Obtain

### 1. **Electricity Maps API** (REQUIRED)
- Visit: https://api-portal.electricitymaps.com/
- Sign up for free tier (1,000 requests/day)
- Get your API key

### 2. **OpenAI API** (REQUIRED)
- Visit: https://platform.openai.com/api-keys
- Create API key
- Required for embeddings and intelligence

### 3. **Upstash Vector** (REQUIRED)
- Visit: https://console.upstash.com/vector
- Create vector database
- Get REST URL and token

### 4. **Upstash QStash** (REQUIRED)
- Visit: https://console.upstash.com/qstash
- Create QStash service
- Get token and signing keys

### 5. **DEKES API** (OPTIONAL)
- Only if you're integrating with DEKES lead generation

## 🔧 Back4App Add-ons Required

### PostgreSQL Database
1. In Back4App Console → Add-ons → PostgreSQL
2. Create database named `ecobe`
3. Get connection string for `DATABASE_URL`

### Redis Cache
1. In Back4App Console → Add-ons → Redis  
2. Create Redis instance
3. Get connection string for `REDIS_URL`

## ⚡ Production Optimizations

### Resource Allocation
- **Minimum**: 512MB RAM, 1 CPU core
- **Recommended**: 1GB RAM, 2 CPU cores
- **Auto-scaling**: Enable for production

### Environment-Specific Settings
```env
# Production optimizations
API_RATE_LIMIT_WINDOW_SECONDS=60
API_RATE_LIMIT_MAX_REQUESTS=300
API_KEY_CACHE_TTL_SECONDS=300
```

## 🚨 Deployment Verification

After deployment, test these endpoints:

### Health Check
```bash
curl https://your-app.back4app.io/health
```

### Carbon Command API
```bash
curl -X POST https://your-app.back4app.io/api/v1/carbon/command \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "orgId": "test",
    "workload": {
      "type": "inference",
      "estimatedGpuHours": 10
    },
    "constraints": {
      "maxLatencyMs": 100,
      "mustRunRegions": ["US-EAST-1"]
    }
  }'
```

## 🎯 Success Indicators

✅ **Health check returns 200**
✅ **Carbon command returns optimization results**
✅ **No database connection errors**
✅ **Redis cache working**
✅ **Vector similarity working**
✅ **Background jobs scheduled**

## 🆘 Troubleshooting

### Common Issues
1. **500 Error**: Missing environment variables
2. **Database Error**: Wrong `DATABASE_URL` format
3. **Redis Error**: Wrong `REDIS_URL` format
4. **OpenAI Error**: Invalid or missing `OPENAI_API_KEY`
5. **Vector Error**: Wrong Upstash credentials

### Debug Commands
```bash
# Check logs in Back4App Console
# Test individual API endpoints
# Verify environment variables in Back4App dashboard
```

## 📈 Production Monitoring

Set up alerts for:
- CPU usage > 80%
- Memory usage > 80%
- Response time > 2s
- Error rate > 5%

## 🎉 You're Ready!

Once deployed, you'll have a **production-grade carbon optimization engine** that:
- Optimizes workloads for minimal carbon impact
- Uses AI for workload similarity matching
- Schedules background jobs for intelligence
- Tracks and verifies carbon savings
- Integrates with multiple data sources

**This is enterprise-grade technology. Deploy with confidence!** 🚀
