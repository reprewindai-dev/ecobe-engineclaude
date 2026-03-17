import { Router } from 'express'
import { prisma } from '../lib/db'

const router = Router()

/**
 * GET /api/v1/integrations/dekes/summary
 * Returns DEKES integration summary
 */
router.get('/dekes/summary', async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const workloads = await prisma.dekesWorkload.findMany({
      where: { scheduledTime: { gte: since } },
      select: {
        actualCO2: true,
        estimatedQueries: true,
        status: true,
        scheduledTime: true,
      },
    })

    const successfulCount = workloads.filter((w: any) => w.status === 'REPORTED' || w.status === 'COMPLETED').length
    const totalCO2 = workloads.reduce((sum: number, w: any) => sum + (w.actualCO2 ?? 0), 0)
    const avgCO2 = workloads.length > 0 ? totalCO2 / workloads.length : 0

    return res.json({
      status: 'connected',
      integration: 'DEKES',
      lastSync: new Date().toISOString(),
      metrics: {
        totalWorkloads: workloads.length,
        successfulWorkloads: successfulCount,
        successRate: workloads.length > 0 ? Math.round((successfulCount / workloads.length) * 100) : 0,
        totalCO2Kg: Math.round(totalCO2 * 1000) / 1000,
        avgCO2PerWorkload: Math.round(avgCO2 * 1000) / 1000,
        timeRange: `${days}d`,
      },
    })
  } catch (error) {
    console.error('DEKES integration summary error:', error)
    res.status(500).json({ error: 'Failed to fetch DEKES summary' })
  }
})

/**
 * GET /api/v1/integrations/dekes/events
 * Returns recent DEKES integration events
 */
router.get('/dekes/events', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50
    const hours = parseInt(req.query.hours as string) || 24
    const since = new Date(Date.now() - hours * 60 * 60 * 1000)

    const events = await prisma.integrationEvent.findMany({
      where: {
        source: 'DEKES_INTEGRATION',
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    const formattedEvents = events.map((event: any) => {
      let message = event.message
      try {
        const parsed = typeof event.message === 'string' ? JSON.parse(event.message) : event.message
        message = parsed
      } catch {
        // Keep as string
      }

      return {
        id: event.id,
        timestamp: event.createdAt.toISOString(),
        type: event.eventType || 'INTEGRATION_EVENT',
        message,
        status: event.success ? 'success' : 'error',
      }
    })

    return res.json({
      source: 'DEKES_INTEGRATION',
      timeRange: `${hours}h`,
      events: formattedEvents,
      total: formattedEvents.length,
    })
  } catch (error) {
    console.error('DEKES integration events error:', error)
    res.status(500).json({ error: 'Failed to fetch DEKES events' })
  }
})

/**
 * GET /api/v1/integrations/dekes/metrics
 * Returns DEKES integration health metrics
 */
router.get('/dekes/metrics', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours as string) || 168 // 1 week default

    // Get recent events
    const since = new Date(Date.now() - hours * 60 * 60 * 1000)

    const [successEvents, failureEvents, totalWorkloads] = await Promise.all([
      prisma.integrationEvent.count({
        where: {
          source: 'DEKES_INTEGRATION',
          createdAt: { gte: since },
          success: true,
        },
      }),
      prisma.integrationEvent.count({
        where: {
          source: 'DEKES_INTEGRATION',
          createdAt: { gte: since },
          success: false,
        },
      }),
      prisma.dekesWorkload.count({
        where: { scheduledTime: { gte: since } },
      }),
    ])

    const totalEvents = successEvents + failureEvents
    const successRate = totalEvents > 0 ? Math.round((successEvents / totalEvents) * 100) : 100
    const failureRate = totalEvents > 0 ? Math.round((failureEvents / totalEvents) * 100) : 0

    // Get hourly trend
    const workloads = await prisma.dekesWorkload.findMany({
      where: { scheduledTime: { gte: since } },
      select: { scheduledTime: true, actualCO2: true },
      orderBy: { scheduledTime: 'desc' },
    })

    const hourlyMap = new Map<string, { count: number; co2: number }>()
    for (const w of workloads) {
      const hour = w.scheduledTime.toISOString().split(':')[0] + ':00'
      const existing = hourlyMap.get(hour) || { count: 0, co2: 0 }
      existing.count++
      existing.co2 += w.actualCO2 ?? 0
      hourlyMap.set(hour, existing)
    }

    const hourlyTrend = Array.from(hourlyMap.entries())
      .map(([hour, data]: [string, any]) => ({
        hour,
        requestCount: data.count,
        avgCO2: Math.round((data.co2 / data.count) * 1000) / 1000,
      }))
      .sort((a, b) => a.hour.localeCompare(b.hour))

    // Calculate actual average response time from workload durations
    const completedWorkloads = await prisma.dekesWorkload.findMany({
      where: {
        scheduledTime: { gte: since },
        completedAt: { not: null },
      },
      select: { scheduledTime: true, completedAt: true },
    })

    let avgResponseTimeMs = 0
    if (completedWorkloads.length > 0) {
      const totalMs = completedWorkloads.reduce((sum: number, w: any) => {
        const duration = w.completedAt.getTime() - w.scheduledTime.getTime()
        return sum + Math.max(0, duration)
      }, 0)
      avgResponseTimeMs = Math.round(totalMs / completedWorkloads.length)
    }

    return res.json({
      integration: 'DEKES',
      status: failureRate > 20 ? 'degraded' : 'healthy',
      timeRange: `${hours}h`,
      metrics: {
        successRate,
        failureRate,
        totalEvents,
        totalWorkloads,
        avgResponseTimeMs,
        uptime: failureRate === 0 ? 100 : Math.round((100 - failureRate) * 10) / 10,
      },
      hourlyTrend: hourlyTrend.slice(-24), // Last 24 data points
      lastChecked: new Date().toISOString(),
    })
  } catch (error) {
    console.error('DEKES integration metrics error:', error)
    res.status(500).json({ error: 'Failed to fetch DEKES metrics' })
  }
})

export default router
