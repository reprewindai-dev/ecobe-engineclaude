import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Link from 'next/link'
import './globals.css'
import { Providers } from './providers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'CO₂ Router — Carbon-Aware Compute Operations Console',
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
          <div className="min-h-screen bg-slate-950">
            {/* Header */}
            <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm">
              <div className="container mx-auto px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                      <span className="text-white font-bold text-xl">🌱</span>
                    </div>
                    <div>
                      <h1 className="text-xl font-bold text-white">CO₂ Router</h1>
                      <p className="text-xs text-slate-400">Carbon-Aware Compute Operations</p>
                    </div>
                  </div>
                  <nav className="flex items-center space-x-4">
                    <Link href="/console" className="text-sm text-slate-300 hover:text-white transition">
                      Console
                    </Link>
                    <a
                      href="/api/ecobe/methodology"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-slate-500 hover:text-slate-300 transition"
                    >
                      Methodology
                    </a>
                  </nav>
                </div>
              </div>
            </header>

            {/* Main Content */}
            <main className="container mx-auto px-6 py-8">
              {children}
            </main>

            {/* Footer */}
            <footer className="border-t border-slate-800 bg-slate-900/50 mt-16">
              <div className="container mx-auto px-6 py-8">
                <div className="flex items-center justify-between text-sm text-slate-400">
                  <p>© 2026 CO₂ Router. Carbon-aware compute for a sustainable future.</p>
                  <p>Signal layer: Electricity Maps · Ember</p>
                </div>
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  )
}
