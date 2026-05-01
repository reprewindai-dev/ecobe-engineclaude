import { PrismaClient } from '@prisma/client'
import { REFERENCE_REGIONS } from '../src/constants/reference-regions'

const prisma = new PrismaClient()

async function main() {
  console.log(`Seeding ${REFERENCE_REGIONS.length} global regions...`)

  for (const region of REFERENCE_REGIONS) {
    const sharedFields = {
      name: region.displayName,
      country: region.country,
      balancingAuthority: region.balancingAuthority,
      cloudRegions: region.cloudRegions,
      avgCarbonIntensity: region.avgCarbonIntensity,
      renewableCapacity: region.renewableCapacity,
      typicalLatencyMs: region.typicalLatencyMs,
      costPerKwh: region.costPerKwh,
      waterStressIndex: region.waterStressIndex,
      estimatedFlag: region.estimatedFlag,
      syntheticFlag: region.syntheticFlag,
      enabled: true,
      metadata: {
        wattTimeZone: region.wattTimeZone ?? null,
        eiaRespondent: region.eiaRespondent ?? null,
        gridZone: region.gridZone ?? null,
        notes: region.notes ?? null,
        seededAt: new Date().toISOString(),
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

    const flags = [
      region.estimatedFlag ? 'estimated' : '',
      region.syntheticFlag ? 'synthetic' : '',
    ].filter(Boolean).join('+') || 'live'

    console.log(`  ✓ ${region.regionCode} — ${region.displayName} (${region.avgCarbonIntensity}g, ${flags})`)
  }

  console.log(`\n✅ ${REFERENCE_REGIONS.length} regions seeded successfully.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
