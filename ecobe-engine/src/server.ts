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

    // Check Redis
    await redis.ping()

    res.json({
      status: 'healthy',
      service: 'ECOBE Engine',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
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
    await redis.ping()
    console.log('✅ Redis connected')

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
  await redis.quit()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('Shutting down...')
  await prisma.$disconnect()
  await redis.quit()
  process.exit(0)
})

start()
