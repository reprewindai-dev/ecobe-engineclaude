import type { Metadata } from 'next'

export const siteUrl = 'https://co2router.com'
export const siteName = 'CO2 Router'
export const siteTitle = 'Deterministic Environmental Execution Control Plane'
export const defaultDescription =
  'CO2 Router authorizes compute before execution using carbon, water, and policy constraints, then attaches proof, trace, replay, and provenance to every decision.'
export const defaultOgImage = '/co2router-poster.svg'

export const coreSitePaths = [
  '/',
  '/design-partners',
  '/design-partners/one-pager',
  '/console',
  '/assurance',
  '/status',
  '/methodology',
  '/blog',
  '/developers/api',
  '/developers/adapters',
  '/developers/architecture',
  '/developers/quickstart',
  '/system/decision-engine',
  '/system/saiq-governance',
  '/system/trace-ledger',
  '/system/replay',
  '/system/provenance',
  '/company/about',
  '/company/security',
  '/company/roadmap',
] as const

type PageMetadataOptions = {
  title: string
  description: string
  path: string
  keywords?: string[]
}

export function createPageMetadata({
  title,
  description,
  path,
  keywords = [],
}: PageMetadataOptions): Metadata {
  const url = path === '/' ? siteUrl : `${siteUrl}${path}`

  return {
    title,
    description,
    keywords,
    alternates: {
      canonical: path,
    },
    openGraph: {
      type: 'website',
      siteName,
      title,
      description,
      url,
      images: [
        {
          url: defaultOgImage,
          width: 1200,
          height: 630,
          alt: 'CO2 Router control surface poster',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [defaultOgImage],
    },
  }
}
