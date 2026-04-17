const normalizedCwd = process.cwd().replace(/\\/g, '/')

export const runtimeBuildInfo = {
  revision:
    process.env.RENDER_GIT_COMMIT ??
    process.env.GITHUB_SHA ??
    process.env.SOURCE_VERSION ??
    null,
  branch:
    process.env.RENDER_GIT_BRANCH ??
    process.env.GITHUB_REF_NAME ??
    process.env.VERCEL_GIT_COMMIT_REF ??
    null,
  serviceId: process.env.RENDER_SERVICE_ID ?? null,
  serviceName: process.env.RENDER_SERVICE_NAME ?? null,
  instanceId: process.env.RENDER_INSTANCE_ID ?? null,
  runtimeRoot: normalizedCwd,
  nestedDuplicatePathDetected: normalizedCwd.toLowerCase().includes('/ecobe-engine/ecobe-engine'),
} as const

