# CO₂ Grid (HaloGrid) Wiring Fixes - Coolify/Hetzner Backend

## Summary
All HaloGrid UI routes now correctly wired to Coolify backend at `http://5.78.135.11:8000`

## Files Changed

### Dashboard Configuration
1. **ecobe-dashboard/Dockerfile**
   - Changed: `ARG ECOBE_API_URL="http://5.78.135.11:8000"`

2. **ecobe-dashboard/next.config.js**
   - Changed: Default engine URL to Coolify

3. **ecobe-dashboard/.env.production** (NEW)
   - Created with all production env vars pointing to Coolify

### Engine Connection Library
4. **ecobe-dashboard/src/lib/control-surface/engine.ts**
   - Changed: `DEFAULT_ENGINE_URL = 'http://5.78.135.11:8000'`

### API Routes - All Updated to Coolify Backend
5. **ecobe-dashboard/src/app/api/ecobe/[...path]/route.ts**
   - Changed: DEFAULT_ENGINE_URL to Coolify

6. **ecobe-dashboard/src/app/api/dashboard/regions/route.ts**
   - Changed: Default URL from localhost to Coolify

7. **ecobe-dashboard/src/app/api/dashboard/kpis/route.ts**
   - Changed: Default URL from localhost to Coolify

8. **ecobe-dashboard/src/app/api/integrations/dekes/route.ts**
   - Changed: Default URL from localhost to Coolify

9. **ecobe-dashboard/src/app/api/providers/health/route.ts**
   - Changed: Default URL from Railway to Coolify

### Backend Deployment
10. **Dockerfile** (root)
    - Fixed: Root-level deployment (removed old ecobe-engine/ paths)

11. **docker-compose.prod.yml** (NEW)
    - Created for Coolify production deployment

12. **COOLIFY_ECOBE_ENGINE.json** (NEW)
    - Deployment config for Coolify dashboard

## Environment Variables Required

### For Dashboard (Vercel/Railway)
```
ECOBE_API_URL=http://5.78.135.11:8000
ECOBE_INTERNAL_API_KEY=J7HYlEVnDV9qZ8cUfx+PwaJzmToM33xtIDxPkZ1bvbDIXUjzmrtaEnD+eqCUYcFg
DECISION_API_SIGNATURE_SECRET=ku9TIQbVyZKzHWg5lE7IjXly3FZW7E5Naa9sEOBlP1WpoytgE3jRdIxKBXZpbPtF
```

### For Backend (Coolify)
```
NODE_ENV=production
PORT=8080
DATABASE_URL=${DATABASE_URL}  # From Coolify Postgres
REDIS_URL=${REDIS_URL}        # From Coolify Redis
ELECTRICITY_MAPS_API_KEY=${ELECTRICITY_MAPS_API_KEY}
SECRET_KEY=${SECRET_KEY}
CORS_ORIGINS=https://co2router.tech,https://www.co2router.tech
```

## Deployment Steps

1. **Deploy Backend to Coolify:**
   ```bash
   cd ecobe-engineclaude
   git add Dockerfile docker-compose.prod.yml COOLIFY_ECOBE_ENGINE.json
   git commit -m "fix: Coolify deployment config"
   git push origin main
   ```
   Then in Coolify dashboard (http://5.78.135.11:8000):
   - New Service → Docker Compose
   - Select ecobe-engineclaude repo
   - Use docker-compose.prod.yml
   - Add environment variables

2. **Deploy Dashboard:**
   ```bash
   cd ecobe-dashboard
   git add Dockerfile next.config.js .env.production src/
   git commit -m "fix: wire HaloGrid to Coolify backend"
   git push origin main
   vercel --prod
   ```

## Result
- HaloGrid will show **"BACKEND: ONLINE"** instead of "SIMULATION"
- Real-time carbon intensity data from Electricity Maps
- Live routing decisions from Hetzner/Coolify engine
- Region mesh showing actual grid signals
