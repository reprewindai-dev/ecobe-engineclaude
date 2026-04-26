const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = process.cwd()
const generatedClient = path.join(root, 'node_modules', '.prisma', 'client', 'index.js')
const prismaRuntime = path.join(root, 'node_modules', '@prisma', 'client', 'index.js')

const isClientReady = fs.existsSync(generatedClient) && fs.existsSync(prismaRuntime)

if (isClientReady) {
  process.exit(0)
}

console.warn('[prisma] generated client missing; running prisma generate before startup')

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['prisma', 'generate'],
  {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  },
)

if (result.error) {
  console.error('[prisma] failed to run prisma generate:', result.error)
  process.exit(1)
}

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}
