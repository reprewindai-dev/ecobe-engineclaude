import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CO₂Router API — Pre-Execution Environmental Control for Cloud Infrastructure',
  description: 'Authorize compute before it runs. Five binding actions. Full signal provenance. SHA-256 proof per decision. 77ms p95. The API that blocks dirty compute.',
  keywords: ['carbon-aware API', 'green cloud', 'compute routing', 'environmental governance', 'carbon intensity API', 'ESG infrastructure'],
  authors: [{ name: 'CO₂Router Inc.' }],
  openGraph: {
    title: 'CO₂Router API — The API That Blocks Dirty Compute',
    description: 'Authorize compute before it runs. Five binding actions. Cryptographic proof. 77ms p95.',
    siteName: 'CO₂Router API',
    type: 'website',
    locale: 'en_US',
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* Nav */}
        <nav className="sticky top-0 z-50 border-b border-[#1a2826] bg-[#030706]/90 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-14">
            <a href="/" className="flex items-center gap-2.5 group">
              <div className="w-7 h-7 rounded-lg bg-[#22c55e]/10 border border-[#22c55e]/30 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="3" fill="#22c55e"/>
                  <circle cx="7" cy="7" r="6" stroke="#22c55e" strokeWidth="0.8" strokeDasharray="2.5 2"/>
                </svg>
              </div>
              <span className="font-mono font-bold text-sm text-[#e2ebe8] group-hover:text-[#22c55e] transition-colors">CO₂Router</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/20">API</span>
            </a>
            <div className="hidden md:flex items-center gap-1">
              {[
                { label: 'Products', href: '#products' },
                { label: 'Playground', href: '#playground' },
                { label: 'Pricing', href: '/pricing' },
                { label: 'Docs', href: 'https://co2router.tech' },
              ].map((item) => (
                <a key={item.href} href={item.href} className="px-3 py-1.5 rounded text-xs font-medium text-[#8a9e9a] hover:text-[#e2ebe8] hover:bg-[#0d1412] transition-colors">
                  {item.label}
                </a>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono text-[#22c55e]">
                <span className="relative flex h-1.5 w-1.5"><span className="pulse-ring absolute inline-flex h-full w-full rounded-full bg-[#22c55e] opacity-60"/><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#22c55e]"/></span>
                Live
              </div>
              <a href="/pricing" className="px-4 py-1.5 rounded-lg bg-[#22c55e] text-[#030706] text-xs font-bold hover:bg-[#4ade80] transition-colors">
                Start Pilot — $250
              </a>
            </div>
          </div>
        </nav>

        <main>{children}</main>

        {/* Footer */}
        <footer className="border-t border-[#1a2826] mt-32 py-12 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
              {[
                { title: 'Product', links: ['Authorization API', 'Grid Intelligence', 'Decision Replay', 'Carbon Accounting', 'Water Authority'] },
                { title: 'Developers', links: ['Documentation', 'API Reference', 'Quickstart', 'SDKs', 'Status'] },
                { title: 'Company', links: ['About', 'Design Partners', 'Security', 'Methodology', 'Contact'] },
                { title: 'Legal', links: ['Terms', 'Privacy', 'Acceptable Use', 'SLA'] },
              ].map((col) => (
                <div key={col.title}>
                  <div className="text-xs font-mono text-[#556663] uppercase tracking-wider mb-4">{col.title}</div>
                  <div className="space-y-2.5">
                    {col.links.map((link) => (
                      <div key={link}><a href="#" className="text-sm text-[#8a9e9a] hover:text-[#e2ebe8] transition-colors">{link}</a></div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-8 border-t border-[#1a2826] flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold text-sm text-[#22c55e]">CO₂Router</span>
                <span className="text-xs text-[#556663]">Deterministic Environmental Execution Control Plane</span>
              </div>
              <div className="flex items-center gap-6 text-xs text-[#556663]">
                <a href="https://co2router.com" className="hover:text-[#8a9e9a] transition-colors">co2router.com</a>
                <a href="https://co2router.tech" className="hover:text-[#8a9e9a] transition-colors">co2router.tech</a>
                <span>© 2026 CO₂Router Inc.</span>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}
