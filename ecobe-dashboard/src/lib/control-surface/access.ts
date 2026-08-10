import 'server-only'

import type { HallOGridConsoleAccess } from '@/types/control-surface'

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

export function resolveHallOGridAccess(_request?: Request): HallOGridConsoleAccess {
  return {
    tenantId: 'public',
    entitlements: ['public_preview'],
    role: 'viewer',
    mode: 'public_preview',
    label: 'Live Mirror',
    isReadOnlyPreview: true,
    canViewOperatorConsole: false,
    canAccessControls: false,
    canManageDoctrine: false,
    canViewCompliance: false,
    redactionDelayMinutes: 90,
    upgradePrompts: DEFAULT_UPGRADE_PROMPTS,
    proHighlights: DEFAULT_PRO_HIGHLIGHTS,
    upgradeUrl: '/access',
  }
}

export async function resolveHallOGridAccessFromServer(): Promise<HallOGridConsoleAccess> {
  return resolveHallOGridAccess()
}
