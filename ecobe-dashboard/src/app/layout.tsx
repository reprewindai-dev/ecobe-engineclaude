import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Link from 'next/link'

import { CO2RouterLogo } from '@/components/CO2RouterLogo'

import './globals.css'
import { Providers } from './providers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'CO2 Router | Deterministic Environmental Execution Control Plane',
  description: 'Authorize compute before execution with live proof, trace, replay, and governance.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <div className="min-h-screen bg-slate-950 bg-grid-mesh">
            <header className="sticky top-0 z-50 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-xl">
              <div className="container mx-auto px-6 py-3">
                <div className="flex items-center justify-between">
                  <Link href="/" className="group flex items-center gap-3">
                    <CO2RouterLogo size="sm" />
                    <div className="hidden sm:block">
                      <p className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
                        Execution Control Plane
                      </p>
                    </div>
                  </Link>

                  <nav className="flex items-center gap-1">
                    <Link
                      href="/console"
                      className="rounded-lg px-3 py-1.5 text-sm text-slate-300 transition-all duration-200 hover:bg-emerald-500/5 hover:text-emerald-400"
                    >
                      Console
                    </Link>
                    <Link
                      href="/contact"
                      className="rounded-lg px-3 py-1.5 text-sm text-slate-300 transition-all duration-200 hover:bg-cyan-500/5 hover:text-cyan-300"
                    >
                      Contact
                    </Link>
                    <a
                      href="/api/ecobe/methodology"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg px-3 py-1.5 text-sm text-slate-500 transition-all duration-200 hover:bg-slate-800/50 hover:text-slate-300"
                    >
                      Methodology
                    </a>
                    <div className="ml-2 flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1">
                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 pulse-glow" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                        Live
                      </span>
                    </div>
                  </nav>
                </div>
              </div>
            </header>

            <main className="container mx-auto px-6 py-6">{children}</main>

            <footer className="mt-16 border-t border-slate-800/30">
              <div className="container mx-auto px-6 py-6">
                <div className="flex flex-col gap-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                  <p>&copy; 2026 CO2 Router. Deterministic environmental execution control.</p>
                  <div className="flex items-center gap-4">
                    <Link href="/contact" className="transition hover:text-cyan-300">
                      Contact
                    </Link>
                    <Link href="/console" className="transition hover:text-cyan-300">
                      Console
                    </Link>
                  </div>
                </div>
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  )
}
