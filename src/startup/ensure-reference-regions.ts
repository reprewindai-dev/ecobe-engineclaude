import { prisma } from '../lib/db'
import { REFERENCE_REGIONS } from '../constants/reference-regions'

let seeded = false

export async function ensureReferenceRegions(): Promise<void> {
  if (seeded) {
    return
  }

  for (const region of REFERENCE_REGIONS) {
    await prisma.region.upsert({
      where: { code: region.regionCode },
      update: {
        name: region.displayName,
        country: region.country,
        enabled: true,
      },
      create: {
        code: region.regionCode,
        name: region.displayName,
        country: region.country,
        enabled: true,
      },
    })
  }

  seeded = true
}
