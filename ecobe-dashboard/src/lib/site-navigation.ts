export interface SiteLink {
  href: string
  label: string
}

export interface SiteLinkSection {
  title: string
  links: SiteLink[]
}

export const primaryNavLinks: SiteLink[] = [
  { href: '/', label: 'Overview' },
  { href: '/design-partners', label: 'Design Partners' },
  { href: '/#live-system', label: 'Control Surface' },
  { href: '/assurance', label: 'Assurance' },
  { href: '/status', label: 'Status' },
  { href: '/#proof', label: 'Methodology' },
  { href: '/blog', label: 'Blog' },
]

export const footerLinkSections: SiteLinkSection[] = [
  {
    title: 'Product',
    links: [
      { href: '/', label: 'Overview' },
      { href: '/design-partners', label: 'Design Partners' },
      { href: '/#live-system', label: 'Control Surface' },
      { href: '/assurance', label: 'Assurance' },
      { href: '/status', label: 'Status' },
      { href: '/#proof', label: 'Methodology' },
      { href: '/blog', label: 'Blog' },
    ],
  },
  {
    title: 'Developers',
    links: [
      { href: '/developers/api', label: 'API' },
      { href: '/developers/adapters', label: 'Adapters' },
      { href: '/developers/architecture', label: 'Architecture' },
      { href: '/developers/quickstart', label: 'Quickstart' },
    ],
  },
  {
    title: 'System',
    links: [
      { href: '/system/decision-engine', label: 'Decision Engine' },
      { href: '/system/saiq-governance', label: 'SAIQ Governance' },
      { href: '/system/trace-ledger', label: 'Trace Ledger' },
      { href: '/system/replay', label: 'Replay' },
      { href: '/system/provenance', label: 'Provenance' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/company/about', label: 'About' },
      { href: '/company/security', label: 'Security' },
      { href: '/company/roadmap', label: 'Roadmap' },
      { href: '/contact', label: 'Contact' },
    ],
  },
]

export const legalResourceLinks: SiteLink[] = [
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/acceptable-use', label: 'Acceptable Use' },
  { href: '/refund-policy', label: 'Refund Policy' },
]
