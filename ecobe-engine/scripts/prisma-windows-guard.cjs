#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const repoRoot = path.resolve(__dirname, '..')
const prismaDir = path.join(repoRoot, 'node_modules', '.prisma')
const prismaClientDir = path.join(prismaDir, 'client')
const queryEnginePath = path.join(prismaClientDir, 'query_engine-windows.dll.node')
const command = process.argv[2] ?? 'help'
const isWindows = process.platform === 'win32'

function log(message) {
  console.log(`[prisma-guard] ${message}`)
}

function warn(message) {
  console.warn(`[prisma-guard] ${message}`)
}

function fail(message, code = 1) {
  console.error(`[prisma-guard] ${message}`)
  process.exit(code)
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function normalize(value) {
  return String(value ?? '').replace(/\\/g, '/').toLowerCase()
}

function run(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: false,
    ...options,
  })

  if (result.error) {
    throw result.error
  }

  return result.status ?? 0
}

function runCommandLine(commandLine) {
  if (isWindows) {
    return run('cmd.exe', ['/d', '/s', '/c', commandLine])
  }

  return run('/bin/sh', ['-lc', commandLine])
}

function runCapture(commandName, args) {
  const result = spawnSync(commandName, args, {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    shell: false,
  })

  if (result.error) {
    throw result.error
  }

  return result
}

function getNodeProcesses() {
  if (!isWindows) return []

  const result = runCapture('powershell.exe', [
    '-NoProfile',
    '-Command',
    [
      '$items = Get-CimInstance Win32_Process -Filter "name = \'node.exe\'" |',
      'Select-Object ProcessId, CommandLine;',
      'if ($null -eq $items) { "[]" } else { $items | ConvertTo-Json -Compress }',
    ].join(' '),
  ])

  if ((result.status ?? 1) !== 0) {
    return []
  }

  try {
    const parsed = JSON.parse((result.stdout || '[]').trim() || '[]')
    const items = Array.isArray(parsed) ? parsed : parsed ? [parsed] : []

    return items
      .map((item) => ({
        pid: Number(item.ProcessId),
        commandLine: String(item.CommandLine ?? ''),
      }))
      .filter((item) => Number.isFinite(item.pid) && item.pid !== process.pid)
  } catch {
    return []
  }
}

function isLikelyPrismaHolder(processInfo) {
  const commandLine = normalize(processInfo.commandLine)
  const repoMarker = normalize(repoRoot)

  return (
    commandLine.includes(repoMarker) ||
    commandLine.includes('prisma studio') ||
    commandLine.includes('query_engine-windows.dll.node') ||
    commandLine.includes('node_modules/.prisma')
  )
}

function listLikelyHolders() {
  return getNodeProcesses().filter(isLikelyPrismaHolder)
}

function truncate(value, max = 180) {
  if (value.length <= max) return value
  return `${value.slice(0, max - 3)}...`
}

function describeHolders(processes) {
  if (processes.length === 0) {
    return 'none'
  }

  return processes
    .map((processInfo) => `${processInfo.pid}: ${truncate(processInfo.commandLine || 'node.exe')}`)
    .join('\n')
}

function killProcesses(processes) {
  if (!isWindows || processes.length === 0) return 0

  let killed = 0
  for (const processInfo of processes) {
    const status = run('taskkill', ['/PID', String(processInfo.pid), '/T', '/F'])
    if (status === 0) {
      killed += 1
    } else {
      warn(`Failed to terminate PID ${processInfo.pid}.`)
    }
  }

  return killed
}

function removePrismaArtifacts() {
  const targets = [prismaClientDir, prismaDir]
  let lastError = null

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      for (const target of targets) {
        if (fs.existsSync(target)) {
          fs.rmSync(target, { recursive: true, force: true })
        }
      }
      return
    } catch (error) {
      lastError = error
      if (attempt < 3) {
        warn(`Prisma cleanup attempt ${attempt} failed; retrying.`)
        sleepSync(250)
      }
    }
  }

  if (lastError) {
    throw lastError
  }
}

function cleanPrisma({ killHolders = true } = {}) {
  if (isWindows) {
    const holders = listLikelyHolders()
    if (holders.length > 0) {
      warn(`Found repo-local Node processes that can lock Prisma:\n${describeHolders(holders)}`)
      if (killHolders) {
        const killed = killProcesses(holders)
        log(`Terminated ${killed} repo-local Node process(es) before Prisma cleanup.`)
        sleepSync(250)
      } else {
        warn('Leaving holder processes running. Prisma generate may fail until they stop.')
      }
    }
  }

  if (!fs.existsSync(prismaDir)) {
    log('No generated Prisma artifacts found; cleanup skipped.')
    return
  }

  try {
    removePrismaArtifacts()
    log(`Removed ${path.relative(repoRoot, prismaDir)}.`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    fail(
      [
        `Failed to remove ${path.relative(repoRoot, prismaDir)}.`,
        `Windows still has Prisma engine artifacts locked.`,
        `Stop local Node dev servers and Prisma Studio, then rerun this command.`,
        `Known engine file: ${queryEnginePath}`,
        `Error: ${message}`,
      ].join('\n')
    )
  }
}

function runPrismaGenerate() {
  log('Running prisma generate.')
  const status = runCommandLine('npx prisma generate')
  if (status !== 0) {
    fail('prisma generate failed after guarded cleanup.')
  }
}

function startDevServer() {
  log('Starting fresh development server.')
  const status = runCommandLine('npx tsx watch src/server.ts')
  process.exit(status)
}

switch (command) {
  case 'clean':
    cleanPrisma()
    break
  case 'regen':
    cleanPrisma()
    runPrismaGenerate()
    break
  case 'reset-win':
    if (isWindows) {
      cleanPrisma({ killHolders: true })
    } else {
      log('Non-Windows environment detected; running standard Prisma regeneration.')
      cleanPrisma({ killHolders: false })
    }
    runPrismaGenerate()
    break
  case 'dev-fresh':
    cleanPrisma()
    runPrismaGenerate()
    startDevServer()
    break
  case 'help':
  default:
    log('Commands: clean | regen | reset-win | dev-fresh')
    process.exit(command === 'help' ? 0 : 1)
}
