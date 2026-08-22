import type { Metadata } from 'next'

import { CommandCenterShell } from '@/components/command-center/CommandCenterShell'
import { createPageMetadata } from '@/lib/seo'

export const metadata: Metadata = createPageMetadata({
  title: 'Preview Console',
  description:
    'Public HallOGrid live mirror showing governed execution, world state, and decision infrastructure without exposing tenant operator authority.',
  path: '/console',
  keywords: [
    'CO2 Router preview console',
    'HallOGrid live mirror',
    'execution control plane',
    'trace replay provenance',
    'SAIQ governance',
  ],
})

export default function ConsolePage() {
  return <CommandCenterShell />
}
