import type { Metadata } from 'next'
import { Space_Grotesk } from 'next/font/google'
import Link from 'next/link'

import { CO2RouterLogo } from '@/components/CO2RouterLogo'
import {
  defaultDescription,
  defaultOgImage,
  siteName,
  siteTitle,
  siteUrl,
} from '@/lib/seo'
import { footerLinkSections, primaryNavLinks } from '@/lib/site-navigation'

import './globals.css'
import { Providers } from './providers'

const spaceGrotesk = Space_Grotesk({ subsets: ['latin'] })

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: siteName,
  title: {
    default: `${siteName} | ${siteTitle}`,
    template: `%s | ${siteName}`,
  },
  description: defaultDescription,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    siteName,
    title: `${siteName} | ${siteTitle}`,
    description: defaultDescription,
    url: siteUrl,
    images: [
      {
        url: defaultOgImage,
        width: 1200,
        height: 630,
        alt: `${siteName} control surface poster`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${siteName} | ${siteTitle}`,
    description: defaultDescription,
    images: [defaultOgImage],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: '/co2router-symbol.png',
    shortcut: '/co2router-symbol.png',
    apple: '/co2router-symbol.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteName,
    url: siteUrl,
    description: defaultDescription,
    publisher: {
      '@type': 'Organization',
      name: siteName,
      url: siteUrl,
    },
  }

  return (
    <html lang="en">
      <body className={spaceGrotesk.className}>
        <Providers>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
          />
          <div className="min-h-screen bg-slate-950 bg-grid-mesh">
            <header className="sticky top-0 z-50 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-xl">
              <div className="mx-auto flex w-full max-w-[1500px] flex-wrap items-center justify-between gap-6 px-6 py-3">
                <Link href="/" className="group flex flex-col items-start gap-1">
                  <CO2RouterLogo size="md" orientation="lockup" />
                  <p className="hidden pl-[3.95rem] text-[10px] font-medium uppercase tracking-widest text-slate-500 md:block">
                    Decision Infrastructure Interface
                  </p>
                </Link>
                <nav className="flex flex-wrap items-center gap-1">
                  {primaryNavLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="rounded-lg px-3 py-1.5 text-sm text-slate-300 transition-all duration-200 hover:bg-cyan-300/5 hover:text-cyan-300"
                    >
                      {link.label}
                    </Link>
                  ))}
                  <a
                    href="/api/ecobe/ci/health"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg px-3 py-1.5 text-sm text-slate-500 transition-all duration-200 hover:bg-slate-800/50 hover:text-slate-300"
                  >
                    Engine Health
                  </a>
                  <div className="ml-2 flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1">
                    <div className="pulse-glow h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                      Live
                    </span>
                  </div>
                </nav>
              </div>
            </header>

            <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6">{children}</main>

            <footer className="mt-16 border-t border-slate-800/30">
              <div className="mx-auto w-full max-w-[1500px] px-6 py-8">
                <div className="space-y-2 text-left">
                  <div className="text-xl font-black tracking-[-0.04em] text-white">CO2 Router</div>
                  <div className="text-sm font-semibold text-slate-200">
                    Deterministic Environmental Execution Control Plane
                  </div>
                  <p className="max-w-xl text-sm text-slate-400">
                    Authorize compute before it runs. Prove every decision.
                  </p>
                </div>

                <div className="mt-8 grid gap-6 text-left sm:grid-cols-2 xl:grid-cols-4">
                  {footerLinkSections.map((section) => (
                    <div key={section.title} className="space-y-3">
                      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                        {section.title}
                      </div>
                      <div className="space-y-2">
                        {section.links.map((link) => (
                          <Link
                            key={link.href}
                            href={link.href}
                            className="block text-sm text-slate-300 transition hover:text-white"
                          >
                            {link.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-8 border-t border-slate-800/40 pt-4 text-left text-xs text-slate-500">
                  &copy; 2026 CO2 Router
                </div>
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  )
}
