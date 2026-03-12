import type { Prisma } from '@prisma/client'

export const toInputJson = (value: unknown): Prisma.InputJsonValue => {
  if (value === undefined) {
    return null
  }

  // Ensure the value is serializable and strips functions/undefined
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

export const parseJsonRecord = <T extends Record<string, unknown>>(
  value: Prisma.JsonValue | null | undefined,
  fallback: T = {} as T
): T => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as T
  }

  return fallback
}
