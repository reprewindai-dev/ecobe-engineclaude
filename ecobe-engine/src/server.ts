import { env } from './config/env'
import { prisma } from './lib/db'
import { redis } from './lib/redis'
import { createApp } from './app'
import { startForecastWorker } from './workers/forecast-poller'

const app = createApp()

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

      startForecastWorker()
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
