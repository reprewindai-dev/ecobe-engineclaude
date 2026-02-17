import axios from 'axios'
import { env } from '../config/env'
import { prisma } from './db'
import { routeGreen } from './green-routing'
import { calculateEnergyEquation } from './energy-equation'

export interface DekesQuery {
  id: string
  query: string
  estimatedResults: number
}

export class DekesIntegration {
  private baseUrl: string
  private apiKey?: string

  constructor() {
    this.baseUrl = env.DEKES_API_URL || 'http://localhost:3000'
    this.apiKey = env.DEKES_API_KEY
  }

  /**
   * Optimize DEKES query execution based on carbon budget
   */
  async optimizeQuery(
    query: DekesQuery,
    carbonBudget: number,
    regions: string[]
  ): Promise<{
    selectedRegion: string
    estimatedCO2: number
    scheduledTime?: Date
  }> {
    // Estimate energy for DEKES query
    // Assume 1000 results ≈ 100 search API calls ≈ 0.05 kWh
    const estimatedRequests = query.estimatedResults || 100
    const estimatedEnergyKwh = (estimatedRequests / 1000) * 0.05

    // Get carbon intensity for regions
    const routing = await routeGreen({
      preferredRegions: regions,
      maxCarbonGPerKwh: carbonBudget / estimatedEnergyKwh,
    })

    const estimatedCO2 = estimatedEnergyKwh * routing.carbonIntensity

    // Log workload
    await prisma.dekesWorkload.create({
      data: {
        dekesQueryId: query.id,
        queryString: query.query,
        estimatedQueries: 1,
        estimatedResults: query.estimatedResults,
        carbonBudget,
        selectedRegion: routing.selectedRegion,
        actualCO2: estimatedCO2,
        status: 'PENDING',
      },
    })

    return {
      selectedRegion: routing.selectedRegion,
      estimatedCO2,
    }
  }

  /**
   * Schedule DEKES batch queries for lowest carbon window
   */
  async scheduleBatchQueries(
    queries: DekesQuery[],
    regions: string[],
    windowHours: number = 24
  ): Promise<{
    optimalTime: Date
    region: string
    estimatedCO2: number
  }> {
    // Find lowest carbon window in next N hours
    // For now, use current time (would integrate with forecasting)
    const routing = await routeGreen({
      preferredRegions: regions,
    })

    const totalResults = queries.reduce((sum, q) => sum + (q.estimatedResults || 100), 0)
    const estimatedEnergyKwh = (totalResults / 1000) * 0.05
    const estimatedCO2 = estimatedEnergyKwh * routing.carbonIntensity

    return {
      optimalTime: new Date(),
      region: routing.selectedRegion,
      estimatedCO2,
    }
  }

  /**
   * Report actual carbon usage back to DEKES
   */
  async reportCarbonUsage(queryId: string, actualCO2: number): Promise<void> {
    if (!this.apiKey) return

    try {
      await axios.post(
        `${this.baseUrl}/api/carbon/report`,
        {
          queryId,
          actualCO2,
          timestamp: new Date().toISOString(),
        },
        {
          headers: { Authorization: `Bearer ${this.apiKey}` },
        }
      )
    } catch (error) {
      console.error('Failed to report carbon usage to DEKES:', error)
    }
  }

  /**
   * Get DEKES workload analytics and history
   */
  async getWorkloadAnalytics(
    dekesQueryId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    totalWorkloads: number
    totalCO2Saved: number
    averageCarbonIntensity: number
    workloads: Array<{
      id: string
      dekesQueryId: string
      queryString: string
      selectedRegion: string
      actualCO2: number
      status: string
      createdAt: Date
    }>
  }> {
    const where: any = {}

    if (dekesQueryId) {
      where.dekesQueryId = dekesQueryId
    }

    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = startDate
      if (endDate) where.createdAt.lte = endDate
    }

    const workloads = await prisma.dekesWorkload.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    const totalCO2 = workloads.reduce((sum, w) => sum + w.actualCO2, 0)
    const avgCarbonIntensity =
      workloads.length > 0
        ? workloads.reduce((sum, w) => sum + (w.actualCO2 / ((w.estimatedResults / 1000) * 0.05 || 1)), 0) /
          workloads.length
        : 0

    // Calculate CO2 saved vs default high-carbon region (assume 500 gCO2/kWh baseline)
    const baselineCO2 = workloads.reduce(
      (sum, w) => sum + (w.estimatedResults / 1000) * 0.05 * 500,
      0
    )
    const totalCO2Saved = baselineCO2 - totalCO2

    return {
      totalWorkloads: workloads.length,
      totalCO2Saved: Math.max(0, totalCO2Saved),
      averageCarbonIntensity: Math.round(avgCarbonIntensity),
      workloads: workloads.map((w) => ({
        id: w.id,
        dekesQueryId: w.dekesQueryId,
        queryString: w.queryString,
        selectedRegion: w.selectedRegion,
        actualCO2: w.actualCO2,
        status: w.status,
        createdAt: w.createdAt,
      })),
    }
  }
}

export const dekesIntegration = new DekesIntegration()
