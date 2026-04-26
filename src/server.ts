import { createServer, type IncomingMessage, type RequestListener, type Server, type ServerResponse } from 'http'

import { env } from './config/env'
import { createApp } from './app'
import { prisma } from './lib/db'
import { assertSchemaReadiness } from './lib/db/schema-readiness'
import { redis } from './lib/redis'
import { ensureMigrationsReady } from './startup/ensure-migrations-ready'
import { ensureReferenceRegions } from './startup/ensure-reference-regions'
import {
  startRoutingSignalWarmLoop,
  stopRoutingSignalWarmLoop,
  warmCacheOnStartup,
} from './lib/cache-warmer'
import { startEIAIngestionWorker } from './workers/eia-ingestion'
import { startForecastVerificationWorker } from './workers/forecast-verification'
import { startForecastWorker } from './workers/forecast-poller'
import { scheduleIntelligenceJobs } from './workers/intelligence-scheduler'
import { startLearningLoopWorker } from './workers/learning-loop'
import { stopLearningLoopWorker } from './workers/learning-loop'
import {
  startRuntimeSupervisor,
  stopRuntimeSupervisor,
} from './workers/runtime-supervisor'
import {
  startDecisionEventDispatcherWorker,
  stopDecisionEventDispatcherWorker,
} from './workers/decision-event-dispatcher'
import {
  startPglAuditRetryWorker,
  stopPglAuditRetryWorker,
} from './workers/pgl-audit-retry'
import {
  recoverWaterArtifactsFromLastKnownGood,
  validateWaterArtifacts,
} from './lib/water/bundle'
import { ensureDecisionEventVerifierSink } from './lib/ci/event-verifier-sink'

const app = createApp()
let server: Server | null = null
let isShuttingDown = false

function requestPath(req: IncomingMessage) {
  return new URL(req.url ?? '/', 'http://localhost').pathname.replace(/\/+$/, '') || '/'
}

function writeJson(res: ServerResponse, statusCode: number, payload: unknown) {
  const body = JSON.stringify(payload)
  res.statusCode = statusCode
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('content-length', Buffer.byteLength(body))
  res.end(body)
}

function extractInternalToken(req: IncomingMessage) {
  const authorization = req.headers.authorization
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length).trim()
  }

  const internalKey = req.headers['x-ecobe-internal-key']
  if (typeof internalKey === 'string' && internalKey.trim()) {
    return internalKey.trim()
  }

  const apiKey = req.headers['x-api-key']
  if (typeof apiKey === 'string' && apiKey.trim()) {
    return apiKey.trim()
  }

  return null
}

function isProtectedEnginePath(pathname: string) {
  return (
    pathname === '/ui' ||
    pathname.startsWith('/ui/') ||
    pathname === '/api/v1' ||
    pathname.startsWith('/api/v1/') ||
    pathname === '/internal/v1' ||
    pathname.startsWith('/internal/v1/')
  )
}

function isInternalRequest(req: IncomingMessage) {
  if (!env.ECOBE_INTERNAL_API_KEY) return false
  return extractInternalToken(req) === env.ECOBE_INTERNAL_API_KEY
}

function extractBrokerId(req: IncomingMessage) {
  const brokerId = req.headers['x-ecobe-broker-id']
  if (typeof brokerId === 'string' && brokerId.trim()) {
    return brokerId.trim()
  }

  return null
}

function isLoopbackRequest(req: IncomingMessage) {
  const remoteAddress = req.socket.remoteAddress ?? ''
  return (
    remoteAddress === '127.0.0.1' ||
    remoteAddress === '::1' ||
    remoteAddress === '::ffff:127.0.0.1'
  )
}

function hasTrustedBrokerIdentity(req: IncomingMessage) {
  if (!env.ECOBE_ENFORCE_BROKER_ID) return true
  if (isLoopbackRequest(req)) return true
  return extractBrokerId(req) === env.ECOBE_TRUSTED_BROKER_ID
}

const engineRequestListener: RequestListener = (req, res) => {
  const pathname = requestPath(req)

  if (pathname === '/health') {
    writeJson(res, 200, {
      status: 'ok',
      service: 'ecobe-engineclaude',
      timestamp: new Date().toISOString(),
    })
    return
  }

  if (isProtectedEnginePath(pathname) && !isInternalRequest(req)) {
    writeJson(res, 401, {
      error: 'Unauthorized',
      code: 'UNAUTHORIZED_INTERNAL_CALL',
    })
    return
  }

  if (isProtectedEnginePath(pathname) && !hasTrustedBrokerIdentity(req)) {
    writeJson(res, 403, {
      error: 'Caller is not an approved broker',
      code: 'UNSUPPORTED_CALLER',
    })
    return
  }

  app(req, res)
}

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return
  isShuttingDown = true
  console.log(`\n${signal} received. Starting graceful shutdown...`)

  const shutdownTimer = setTimeout(() => {
    console.error('Shutdown timed out after 15s. Forcing exit.')
    process.exit(1)
  }, 15000)
  shutdownTimer.unref()

  try {
    if (server) {
      await new Promise<void>((resolve) => {
        server!.close(() => {
          console.log('HTTP server closed')
          resolve()
        })
      })
    }

    await Promise.allSettled([
      Promise.resolve(stopRuntimeSupervisor()),
      Promise.resolve(stopLearningLoopWorker()),
      Promise.resolve(stopDecisionEventDispatcherWorker()),
      Promise.resolve(stopPglAuditRetryWorker()),
      Promise.resolve(stopRoutingSignalWarmLoop()),
    ])

    console.log('Disconnecting from database...')
    await prisma.$disconnect()

    console.log('Closing Redis connection...')
    await redis.quit().catch(() => undefined)

    clearTimeout(shutdownTimer)
    console.log('Graceful shutdown complete.')
    process.exit(0)
  } catch (error) {
    clearTimeout(shutdownTimer)
    console.error('Error during shutdown:', error)
    process.exit(1)
  }
}

function startBackgroundWorkers() {
  if (!env.ENGINE_BACKGROUND_WORKERS_ENABLED) {
    console.log('  Background workers: disabled')
    return
  }

  console.log('  Background workers: enabled')

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

  warmCacheOnStartup().catch((error) => {
    console.error('Cache warming failed:', error)
  })
  startRoutingSignalWarmLoop()

  try {
    startLearningLoopWorker()
  } catch (error) {
    console.error('Learning loop worker failed to start:', error)
  }

  try {
    startRuntimeSupervisor()
  } catch (error) {
    console.error('Runtime supervisor failed to start:', error)
  }

  try {
    startDecisionEventDispatcherWorker()
  } catch (error) {
    console.error('Decision event dispatcher failed to start:', error)
  }

  try {
    startPglAuditRetryWorker()
  } catch (error) {
    console.error('PGL audit retry worker failed to start:', error)
  }
}

async function start() {
  try {
    if (env.NODE_ENV === 'production' && !env.ECOBE_INTERNAL_API_KEY) {
      throw new Error('ECOBE_INTERNAL_API_KEY is required in production')
    }

    let waterArtifacts = validateWaterArtifacts()
    if (!waterArtifacts.healthy) {
      console.error('Water artifact health check failed at startup:', waterArtifacts)
      const recovery = recoverWaterArtifactsFromLastKnownGood()
      if (recovery.recovered) {
        console.warn('Recovered water artifacts from last-known-good snapshot at startup')
        waterArtifacts = validateWaterArtifacts()
      }
      if (env.NODE_ENV === 'production') {
        if (!waterArtifacts.healthy) {
          process.exit(1)
        }
      }
    }

    ensureMigrationsReady()

    await prisma.$connect()
    console.log('Database connected')

    await ensureReferenceRegions()

    await assertSchemaReadiness()
    console.log('Schema readiness gate passed')

    try {
      await redis.ping()
      console.log('Redis connected')
    } catch (error) {
      console.error('Redis error:', error)
      console.warn('Redis unavailable at startup; continuing without Redis')
    }

    const verifierSink = await ensureDecisionEventVerifierSink()
    if (verifierSink.status === 'created' || verifierSink.status === 'updated') {
      console.log(`Decision event verifier sink ${verifierSink.status}: ${verifierSink.sinkId}`)
    } else {
      console.warn(`Decision event verifier sink skipped: ${verifierSink.reason}`)
    }

    server = createServer(engineRequestListener)
    server.listen(env.PORT, () => {
      console.log(`ECOBE Engine running on port ${env.PORT}`)
      console.log(`  Environment: ${env.NODE_ENV}`)
      console.log(`  Public liveness: http://localhost:${env.PORT}/health`)
      console.log(`  Broker-authenticated health: http://localhost:${env.PORT}/api/v1/health`)
      console.log(`  Broker-authenticated routing API: http://localhost:${env.PORT}/api/v1/routing-decisions`)
      console.log(`  Trusted broker id: ${env.ECOBE_TRUSTED_BROKER_ID}`)
      console.log(`  Broker id enforcement: ${env.ECOBE_ENFORCE_BROKER_ID ? 'enabled' : 'disabled'}`)

      startBackgroundWorkers()
    })
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error)
  void gracefulShutdown('uncaughtException')
})

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason)
})

start()
