import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Link from 'next/link'
import './globals.css'
import { Providers } from './providers'
import { CO2RouterLogo } from '@/components/CO2RouterLogo'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'CO₂Router — Carbon-Aware Compute Operations Console',
  description: 'Real-time carbon routing, decision engine status, and workload optimization',
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
            {/* Header — glass morphism with subtle glow */}
            <header className="sticky top-0 z-50 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-xl">
              <div className="container mx-auto px-6 py-3">
                <div className="flex items-center justify-between">
                  <Link href="/" className="flex items-center gap-3 group">
                    <CO2RouterLogo size="sm" />
                    <div className="hidden sm:block">
                      <p className="text-[10px] text-slate-500 font-medium tracking-widest uppercase">
                        Carbon-Aware Compute
                      </p>
                    </div>
                  </Link>
                  <nav className="flex items-center gap-1">
                    <Link
                      href="/console"
                      className="px-3 py-1.5 text-sm text-slate-300 hover:text-emerald-400 hover:bg-emerald-500/5 rounded-lg transition-all duration-200"
                    >
                      Console
                    </Link>
                    <a
                      href="/api/ecobe/methodology"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 rounded-lg transition-all duration-200"
                    >
                      Methodology
                    </a>
                    <div className="ml-2 flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-glow" />
                      <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">Live</span>
                    </div>
                  </nav>
                </div>
              </div>
            </header>

            {/* Main Content */}
            <main className="container mx-auto px-6 py-6">
              {children}
            </main>

            {/* Footer — minimal, clean */}
            <footer className="border-t border-slate-800/30 mt-16">
              <div className="container mx-auto px-6 py-6">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <p>&copy; 2026 CO₂Router. Carbon-aware compute for a sustainable future.</p>
                  <p className="hidden sm:block">Powered by WattTime &middot; Ember &middot; EIA-930</p>
                </div>
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  )
}
