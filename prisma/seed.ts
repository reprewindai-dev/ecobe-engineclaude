import { PrismaClient } from '@prisma/client'
import { REFERENCE_REGIONS } from '../src/constants/reference-regions'

const prisma = new PrismaClient()

async function main() {
  for (const region of REFERENCE_REGIONS) {
    await prisma.region.upsert({
      where: { code: region.code },
      update: {
        name: region.name,
        country: region.country,
      },
      create: {
        code: region.code,
        name: region.name,
        country: region.country,
      },
    })
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
