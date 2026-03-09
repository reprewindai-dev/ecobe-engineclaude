import { env } from './config/env'
import { prisma } from './lib/db'
import { redis } from './lib/redis'
import { createApp } from './app'
import { logger } from './lib/logger'
import { startForecastWorker } from './workers/forecast-poller'

const app = createApp()

async function start() {
  try {
    await prisma.$connect()
    logger.info('Database connected')

    try {
      await redis.ping()
      logger.info('Redis connected')
    } catch (error) {
      logger.warn({ err: error }, 'Redis unavailable at startup; continuing without Redis')
    }

    app.listen(env.PORT, () => {
      logger.info({ port: env.PORT, env: env.NODE_ENV }, 'CO2 Router running')
      logger.info({ url: `http://localhost:${env.PORT}/health` }, 'Health endpoint')
      logger.info({ url: `http://localhost:${env.PORT}/api/v1` }, 'API endpoint')
      startForecastWorker()
    })
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server')
    process.exit(1)
  }
}

process.on('SIGINT', async () => {
  logger.info('Shutting down (SIGINT)')
  await prisma.$disconnect()
  await redis.quit().catch(() => undefined)
  process.exit(0)
})

process.on('SIGTERM', async () => {
  logger.info('Shutting down (SIGTERM)')
  await prisma.$disconnect()
  await redis.quit().catch(() => undefined)
  process.exit(0)
})

start()
