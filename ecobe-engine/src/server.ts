import express from 'express'
import { env } from './config/env'
import { prisma } from './lib/db'
import { redis } from './lib/redis'
import energyRoutes from './routes/energy'
import routingRoutes from './routes/routing'
import dekesRoutes from './routes/dekes'
import creditsRoutes from './routes/credits'
import decisionsRoutes from './routes/decisions'
import dashboardRoutes from './routes/dashboard'

const app = express()

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Health check
async function healthHandler(req: express.Request, res: express.Response) {
  try {
    // Check database
    await prisma.$queryRaw`SELECT 1`

    let redisOk = true
    try {
      await redis.ping()
    } catch {
      redisOk = false
    }

    const ok = redisOk

    res.status(ok ? 200 : 503).json({
      status: ok ? 'healthy' : 'unhealthy',
      service: 'ECOBE Engine',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      checks: {
        database: true,
        redis: redisOk,
      },
    })
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

app.get('/health', healthHandler)
app.get('/api/v1/health', healthHandler)

app.get('/ui', (_req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ECOBE Engine UI</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 0; padding: 24px; background: #0b1020; color: #e7eaf3; }
      a { color: #9ecbff; }
      h1 { font-size: 20px; margin: 0 0 16px; }
      .grid { display: grid; grid-template-columns: 1fr; gap: 16px; max-width: 1100px; }
      .card { background: #121a33; border: 1px solid #25305a; border-radius: 10px; padding: 14px; }
      .row { display: flex; flex-wrap: wrap; gap: 10px; }
      button { background: #2c6bed; border: 0; color: white; padding: 10px 12px; border-radius: 8px; cursor: pointer; font-weight: 600; }
      button.secondary { background: #394164; }
      button.danger { background: #b42318; }
      input, select { background: #0b1020; border: 1px solid #25305a; color: #e7eaf3; padding: 10px 10px; border-radius: 8px; }
      pre { margin: 10px 0 0; white-space: pre-wrap; word-break: break-word; background: #0b1020; border: 1px solid #25305a; border-radius: 10px; padding: 12px; }
      .muted { color: #aab2d5; font-size: 13px; }
    </style>
  </head>
  <body>
    <h1>ECOBE Engine UI</h1>
    <div class="muted">Use this page to test the deployed engine without any separate dashboard deploy. Same-origin API base: <code id="base"></code></div>
    <div class="grid" style="margin-top: 16px;">
      <div class="card">
        <div class="row">
          <button id="health">GET /api/v1/health</button>
          <button class="secondary" id="metrics">GET /api/v1/dashboard/metrics</button>
          <button class="secondary" id="regions">GET /api/v1/dashboard/regions</button>
          <button class="secondary" id="decisions">GET /api/v1/dashboard/decisions</button>
          <button class="secondary" id="mapping">GET /api/v1/dashboard/region-mapping</button>
        </div>
        <pre id="out">Click a button…</pre>
      </div>

      <div class="card">
        <div class="row" style="align-items: center;">
          <button id="seedDecision">POST /api/v1/decisions (sample)</button>
          <span class="muted">Creates a decision so the dashboard endpoints return data.</span>
        </div>
      </div>

      <div class="card">
        <div class="row" style="align-items: center; gap: 12px;">
          <strong>What-if intensities</strong>
          <label class="muted">Zones</label>
          <input id="zones" style="min-width: 320px;" value="FR,DE,GB" />
          <button class="secondary" id="whatif">POST /api/v1/dashboard/what-if/intensities</button>
        </div>
        <div class="muted" style="margin-top: 8px;">Comma-separated zones. Example: <code>US-CAL-CISO,FR,DE</code></div>
      </div>
    </div>

    <script>
      const base = window.location.origin
      document.getElementById('base').textContent = base

      const out = document.getElementById('out')
      function show(v) { out.textContent = typeof v === 'string' ? v : JSON.stringify(v, null, 2) }

      async function get(path) {
        const r = await fetch(path)
        const t = await r.text()
        let data
        try { data = JSON.parse(t) } catch { data = t }
        return { status: r.status, data }
      }

      async function post(path, body) {
        const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        const t = await r.text()
        let data
        try { data = JSON.parse(t) } catch { data = t }
        return { status: r.status, data }
      }

      async function run(fn) {
        out.textContent = 'Loading…'
        try {
          const res = await fn()
          show(res)
        } catch (e) {
          show({ error: String(e) })
        }
      }

      document.getElementById('health').onclick = () => run(() => get('/api/v1/health'))
      document.getElementById('metrics').onclick = () => run(() => get('/api/v1/dashboard/metrics'))
      document.getElementById('regions').onclick = () => run(() => get('/api/v1/dashboard/regions'))
      document.getElementById('decisions').onclick = () => run(() => get('/api/v1/dashboard/decisions'))
      document.getElementById('mapping').onclick = () => run(() => get('/api/v1/dashboard/region-mapping'))

      document.getElementById('seedDecision').onclick = () => run(async () => {
        const now = new Date().toISOString()
        const body = {
          ts: now,
          workloadName: 'ui-demo',
          opName: 'click-test',
          baselineRegion: 'US-EAST-4',
          chosenRegion: 'FR',
          zoneBaseline: 'US-NEISO',
          zoneChosen: 'FR',
          carbonIntensityBaselineGPerKwh: 500,
          carbonIntensityChosenGPerKwh: 150,
          estimatedKwh: 0.2,
          co2BaselineG: 100,
          co2ChosenG: 30,
          requestCount: 1,
          reason: 'ui-seed',
          meta: { source: 'ui' }
        }
        return await post('/api/v1/decisions', body)
      })

      document.getElementById('whatif').onclick = () => run(async () => {
        const zonesRaw = document.getElementById('zones').value
        const zones = zonesRaw.split(',').map(s => s.trim()).filter(Boolean)
        return await post('/api/v1/dashboard/what-if/intensities', { zones })
      })
    </script>
  </body>
</html>`)
})

// API routes
app.use('/api/v1/energy', energyRoutes)
app.use('/api/v1/route', routingRoutes)
app.use('/api/v1/dekes', dekesRoutes)
app.use('/api/v1/credits', creditsRoutes)
app.use('/api/v1/decisions', decisionsRoutes)
app.use('/api/v1/dashboard', dashboardRoutes)

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

// Start server
async function start() {
  try {
    // Test database connection
    await prisma.$connect()
    console.log('✅ Database connected')

    // Test Redis connection
    try {
      await redis.ping()
      console.log('✅ Redis connected')
    } catch (error) {
      console.error('Redis error:', error)
      console.warn('⚠️  Redis unavailable at startup; continuing without Redis')
    }

    app.listen(env.PORT, () => {
      console.log(`🌱 ECOBE Engine running on port ${env.PORT}`)
      console.log(`   Environment: ${env.NODE_ENV}`)
      console.log(`   Health: http://localhost:${env.PORT}/health`)
      console.log(`   API: http://localhost:${env.PORT}/api/v1`)
    })
  } catch (error) {
    console.error('❌ Failed to start server:', error)
    process.exit(1)
  }
}

// Handle shutdown gracefully
process.on('SIGINT', async () => {
  console.log('Shutting down...')
  await prisma.$disconnect()
  await redis.quit().catch(() => undefined)
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('Shutting down...')
  await prisma.$disconnect()
  await redis.quit().catch(() => undefined)
  process.exit(0)
})

start()
