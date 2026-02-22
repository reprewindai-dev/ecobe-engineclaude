import { prisma } from './db'

export type IntegrationSource = 'ELECTRICITY_MAPS' | 'DEKES_API' | (string & Record<string, never>)

export async function recordIntegrationSuccess(source: IntegrationSource) {
  await prisma.integrationMetric.upsert({
    where: { source },
    update: {
      successCount: { increment: 1 },
      lastSuccessAt: new Date(),
      lastError: null,
    },
    create: {
      source,
      successCount: 1,
      lastSuccessAt: new Date(),
    },
  })
}

export async function recordIntegrationFailure(source: IntegrationSource, error?: string) {
  await prisma.integrationMetric.upsert({
    where: { source },
    update: {
      failureCount: { increment: 1 },
      lastFailureAt: new Date(),
      lastError: error?.slice(0, 500) ?? null,
    },
    create: {
      source,
      failureCount: 1,
      lastFailureAt: new Date(),
      lastError: error?.slice(0, 500) ?? null,
    },
  })
}

export async function getIntegrationMetric(source: IntegrationSource) {
  return prisma.integrationMetric.findUnique({ where: { source } })
}

export function computeIntegrationSuccessRate(metric?: { successCount: number; failureCount: number }) {
  if (!metric) return null
  const total = metric.successCount + metric.failureCount
  if (total === 0) return null
  return metric.successCount / total
}

export async function getIntegrationSuccessRate(source: IntegrationSource) {
  const metric = await getIntegrationMetric(source)
  return computeIntegrationSuccessRate(metric ?? undefined)
}
