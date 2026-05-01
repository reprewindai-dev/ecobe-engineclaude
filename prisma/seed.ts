import { PrismaClient } from '@prisma/client'
import { REFERENCE_REGIONS } from '../src/constants/reference-regions'

const prisma = new PrismaClient()

async function main() {
  console.log(`Seeding ${REFERENCE_REGIONS.length} global regions...`)

  for (const region of REFERENCE_REGIONS) {
    await prisma.region.upsert({
      where: { code: region.code },
      update: {
        name: region.name,
        country: region.country,
        avgCarbonIntensity: region.avgCarbonIntensity,
        renewableCapacity: region.renewableCapacity,
        typicalLatencyMs: region.typicalLatencyMs,
        costPerKwh: region.costPerKwh,
        enabled: true,
        metadata: {
          wattTimeZone: region.wattTimeZone ?? null,
          eiaRespondent: region.eiaRespondent ?? null,
          gridZone: region.gridZone ?? null,
          notes: region.notes ?? null,
          seededAt: new Date().toISOString(),
        },
      },
      create: {
        code: region.code,
        name: region.name,
        country: region.country,
        avgCarbonIntensity: region.avgCarbonIntensity,
        renewableCapacity: region.renewableCapacity,
        typicalLatencyMs: region.typicalLatencyMs,
        costPerKwh: region.costPerKwh,
        enabled: true,
        metadata: {
          wattTimeZone: region.wattTimeZone ?? null,
          eiaRespondent: region.eiaRespondent ?? null,
          gridZone: region.gridZone ?? null,
          notes: region.notes ?? null,
          seededAt: new Date().toISOString(),
        },
      },
    })
    console.log(`  ✓ ${region.code} — ${region.name} (${region.avgCarbonIntensity}g CO₂/kWh)`)
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
