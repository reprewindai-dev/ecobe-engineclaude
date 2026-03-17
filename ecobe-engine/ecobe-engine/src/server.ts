import { env } from './config/env'
import { prisma } from './lib/db'
import { redis } from './lib/redis'
import { createApp } from './app'
import { startForecastWorker } from './workers/forecast-poller'
import { scheduleIntelligenceJobs } from './workers/intelligence-scheduler'
import { startEIAIngestionWorker } from './workers/eia-ingestion'
import { startForecastVerificationWorker } from './workers/forecast-verification'
import { warmCacheOnStartup } from './lib/cache-warmer'
import type { Server } from 'http'

const app = createApp()
let server: Server | null = null
let isShuttingDown = false

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return
  isShuttingDown = true
  console.log(`\n${signal} received. Starting graceful shutdown...`)

  const SHUTDOWN_TIMEOUT = 15000 // 15 seconds
  const shutdownTimer = setTimeout(() => {
    console.error('Shutdown timed out after 15s. Forcing exit.')
    process.exit(1)
  }, SHUTDOWN_TIMEOUT)
  shutdownTimer.unref()

  try {
    // Stop accepting new connections
    if (server) {
      await new Promise<void>((resolve) => {
        server!.close(() => {
          console.log('HTTP server closed')
          resolve()
        })
      })
    }

    console.log('Disconnecting from database...')
    await prisma.$disconnect()

    console.log('Closing Redis connection...')
    await redis.quit().catch(() => undefined)

    clearTimeout(shutdownTimer)
    console.log('✅ Graceful shutdown complete.')
    process.exit(0)
  } catch (error) {
    clearTimeout(shutdownTimer)
    console.error('Error during shutdown:', error)
    process.exit(1)
  }
}

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

    server = app.listen(env.PORT, () => {
      console.log(`🌱 ECOBE Engine running on port ${env.PORT}`)
      console.log(`   Environment: ${env.NODE_ENV}`)
      console.log(`   Health: http://localhost:${env.PORT}/health`)
      console.log(`   Status: http://localhost:${env.PORT}/api/v1/system/status`)
      console.log(`   API: http://localhost:${env.PORT}/api/v1`)

      // Start workers after server is listening
      try {
        startForecastWorker()
      } catch (error) {
        console.error('Forecast poller worker failed to start:', error)
      }

      startEIAIngestionWorker().catch((error) => {
        console.error('EIA ingestion worker failed to start:', error)
      })

      scheduleIntelligenceJobs().catch((error) => {
        console.error('Intelligence job scheduling failed to start:', error)
      })

      try {
        startForecastVerificationWorker()
      } catch (error) {
        console.error('Forecast verification worker failed to start:', error)
      }

      // Warm cache after workers start
      warmCacheOnStartup().catch((err) => {
        console.error('Cache warming failed:', err)
        // Don't exit - cache warming is non-critical
      })
    })
  } catch (error) {
    console.error('❌ Failed to start server:', error)
    process.exit(1)
  }
}

// Handle shutdown signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err)
  gracefulShutdown('uncaughtException')
})

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason)
  // Log but don't exit immediately - let graceful shutdown handle it if needed
})

start()
