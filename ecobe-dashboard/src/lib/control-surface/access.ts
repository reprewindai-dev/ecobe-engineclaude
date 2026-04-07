import 'server-only'

import { cookies, headers } from 'next/headers'

import type {
  HallOGridConsoleAccess,
  HallOGridEntitlement,
  HallOGridRole,
} from '@/types/control-surface'

const DEFAULT_UPGRADE_PROMPTS = [
  'See counterfactuals',
  'Unlock replay',
  'Enable doctrine',
  'Connect your workloads',
  'Run a pilot',
]

const DEFAULT_PRO_HIGHLIGHTS = [
  'tenant-specific routing',
  'full proof',
  'replay',
  'doctrine controls',
  'operator overrides',
  'certified governance',
]

function parseCsvHeader(value: string | null | undefined) {
  if (!value) return []

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseCookie(header: string | null | undefined, name: string) {
  if (!header) return null

  const part = header
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))

  if (!part) return null
  return decodeURIComponent(part.slice(name.length + 1))
}

function normalizeTenantId(value: string | null | undefined) {
  if (!value) return 'public'
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, '-')
  return normalized || 'public'
}

function toEntitlement(value: string): HallOGridEntitlement | null {
  switch (value) {
    case 'public_preview':
    case 'pro_eval':
    case 'pro_production':
    case 'compliance_pack':
      return value
    default:
      return null
  }
}

function toRole(value: string | null | undefined): HallOGridRole {
  switch (value) {
    case 'operator':
    case 'governance_admin':
    case 'org_admin':
      return value
    default:
      return 'viewer'
  }
}

function normalizeEntitlements(values: string[]) {
  const seen = new Set<HallOGridEntitlement>()

  for (const value of values) {
    const entitlement = toEntitlement(value)
    if (entitlement) seen.add(entitlement)
  }

  if (!seen.size) seen.add('public_preview')
  return Array.from(seen)
}

export function resolveHallOGridAccess(request?: Request): HallOGridConsoleAccess {
  const cookieHeader = request?.headers.get('cookie')
  const tenantId = normalizeTenantId(
    request?.headers.get('x-hallogrid-tenant') ??
      parseCookie(cookieHeader, 'hallogrid_tenant') ??
      process.env.HALLOGRID_DEFAULT_TENANT
  )
  const rawEntitlements = [
    ...parseCsvHeader(process.env.HALLOGRID_DEFAULT_ENTITLEMENTS),
    ...parseCsvHeader(request?.headers.get('x-hallogrid-entitlements')),
    ...parseCsvHeader(parseCookie(cookieHeader, 'hallogrid_entitlements')),
  ]

  const entitlements = normalizeEntitlements(rawEntitlements)
  const role = toRole(
    request?.headers.get('x-hallogrid-role') ??
      parseCookie(cookieHeader, 'hallogrid_role') ??
      process.env.HALLOGRID_DEFAULT_ROLE
  )

  const mode = entitlements.includes('pro_production')
    ? 'pro_production'
    : entitlements.includes('pro_eval')
      ? 'pro_eval'
      : 'public_preview'

  const isReadOnlyPreview = mode === 'public_preview'
  const canViewOperatorConsole = !isReadOnlyPreview
  const canAccessControls =
    canViewOperatorConsole && (role === 'operator' || role === 'governance_admin' || role === 'org_admin')
  const canManageDoctrine = mode === 'pro_production' && (role === 'governance_admin' || role === 'org_admin')
  const canViewCompliance = entitlements.includes('compliance_pack')

  return {
    tenantId,
    entitlements,
    role,
    mode,
    label: isReadOnlyPreview ? 'Live Mirror' : 'Operator Console',
    isReadOnlyPreview,
    canViewOperatorConsole,
    canAccessControls,
    canManageDoctrine,
    canViewCompliance,
    redactionDelayMinutes: isReadOnlyPreview ? 90 : 0,
    upgradePrompts: DEFAULT_UPGRADE_PROMPTS,
    proHighlights: DEFAULT_PRO_HIGHLIGHTS,
    upgradeUrl: '/purchase',
  }
}

export function resolveHallOGridAccessFromServer(): HallOGridConsoleAccess {
  const headerStore = headers()
  const cookieStore = cookies()
  const requestHeaders = new Headers()

  const entitlements = headerStore.get('x-hallogrid-entitlements')
  if (entitlements) requestHeaders.set('x-hallogrid-entitlements', entitlements)

  const role = headerStore.get('x-hallogrid-role')
  if (role) requestHeaders.set('x-hallogrid-role', role)

  const serializedCookies = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${encodeURIComponent(cookie.value)}`)
    .join('; ')

  if (serializedCookies) requestHeaders.set('cookie', serializedCookies)

  return resolveHallOGridAccess(new Request('http://localhost', { headers: requestHeaders }))
}
