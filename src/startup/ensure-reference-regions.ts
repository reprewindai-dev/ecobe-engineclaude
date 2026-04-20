import { prisma } from '../lib/db'
import { REFERENCE_REGIONS } from '../constants/reference-regions'

let seeded = false

export async function ensureReferenceRegions(): Promise<void> {
  if (seeded) {
    return
  }

  for (const region of REFERENCE_REGIONS) {
    await prisma.region.upsert({
      where: { code: region.code },
      update: {
        name: region.name,
        country: region.country,
        enabled: true,
      },
      create: {
        code: region.code,
        name: region.name,
        country: region.country,
        enabled: true,
      },
    })
  }

  seeded = true
}
