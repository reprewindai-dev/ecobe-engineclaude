# Demo Setup Guide

## Environment Variables Needed

### For DEKES SaaS (Frontend/Dashboard)
Add these to your Railway environment variables for the DEKES SaaS service:

```bash
# Demo Mode (set to 'true' to enable demo without authentication)
DEMO_MODE=true

# Database (required)
DATABASE_URL=your_postgres_connection_string

# JWT Secrets (required for production, optional for demo)
JWT_SECRET=your_jwt_secret_here
SESSION_SECRET=your_session_secret_here

# Optional: ECOBE Engine Integration (for full functionality)
ECOBE_ENGINE_URL=https://your-ecobe-engine-url.railway.app
ECOBE_ENGINE_API_KEY=your_ecobe_api_key_here
```

### For ECOBE Engine (Backend)
Add these to your Railway environment variables for the ECOBE Engine service:

```bash
# Database (required)
DATABASE_URL=your_postgres_connection_string
REDIS_URL=your_redis_connection_string

# Optional APIs
ELECTRICITY_MAPS_API_KEY=your_electricity_maps_api_key
DEKES_API_URL=https://your-dekes-saas-url.railway.app
DEKES_API_KEY=your_dekes_api_key_here
```

## Demo Mode Features

When `DEMO_MODE=true`, the system will:

1. **Bypass Authentication** - No login required to use the demo
2. **Mock ECOBE Responses** - Returns realistic optimization data without needing the ECOBE Engine
3. **Accept Any Query** - Users can enter any search query they want to test

## Testing the Demo

1. Set `DEMO_MODE=true` in your DEKES SaaS Railway environment variables
2. Deploy/restart the service
3. Navigate to `/runs/new` 
4. Enter any search query (e.g., "SaaS companies looking for AI solutions")
5. Click "Run Intent Scan" to see the optimization results

## Production Mode

For production, set `DEMO_MODE=false` or remove it entirely. The system will then require:
- Valid authentication (JWT tokens)
- Real ECOBE Engine URL and API key
- Proper database setup with users and organizations
