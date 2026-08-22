import { prisma } from '../lib/db'
import { REFERENCE_REGIONS } from '../constants/reference-regions'

let seeded = false

export async function ensureReferenceRegions(): Promise<void> {
  if (seeded) {
    return
  }

  for (const region of REFERENCE_REGIONS) {
    const sharedFields = {
      name: region.displayName,
      country: region.country,
      balancingAuthority: region.balancingAuthority,
      cloudRegions: region.cloudRegions,
      typicalLatencyMs: region.typicalLatencyMs,
      costPerKwh: region.costPerKwh,
      renewableCapacity: region.renewableCapacity,
      avgCarbonIntensity: region.avgCarbonIntensity,
      waterStressIndex: region.waterStressIndex,
      estimatedFlag: region.estimatedFlag,
      syntheticFlag: region.syntheticFlag,
      enabled: !region.syntheticFlag,
      metadata: {
        wattTimeZone: region.wattTimeZone ?? null,
        eiaRespondent: region.eiaRespondent ?? null,
        gridZone: region.gridZone ?? null,
        notes: region.notes ?? null,
      },
    }

    await prisma.region.upsert({
      where: { code: region.regionCode },
      update: sharedFields,
      create: {
        code: region.regionCode,
        ...sharedFields,
      },
    })
  }

  seeded = true
}
