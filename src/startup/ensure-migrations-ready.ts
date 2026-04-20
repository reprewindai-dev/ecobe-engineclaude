import { existsSync } from 'fs'
import { join } from 'path'
import { spawnSync } from 'child_process'

function resolvePrismaBinary() {
  const localBinary = join(
    process.cwd(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
  )

  if (existsSync(localBinary)) {
    return { command: localBinary, args: ['migrate', 'deploy'] }
  }

  return {
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['prisma', 'migrate', 'deploy'],
  }
}

export function ensureMigrationsReady(): void {
  if (process.env.NODE_ENV === 'test') {
    return
  }

  const { command, args } = resolvePrismaBinary()
  const result = spawnSync(command, args, {
    env: process.env,
    stdio: 'inherit',
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(
      `Prisma migration deployment failed with exit code ${String(result.status ?? 'unknown')}`,
    )
  }
}

