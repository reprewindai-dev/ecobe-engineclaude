'use client'

/**
 * CO₂Router Logo — proper subscript 2, animated gradient icon
 * Sizes: 'sm' (nav), 'md' (header), 'lg' (landing hero)
 */
export function CO2RouterLogo({
  size = 'md',
  showText = true,
  animated = true,
}: {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showText?: boolean
  animated?: boolean
}) {
  const sizes = {
    sm: { icon: 28, text: 'text-base', sub: 'text-[8px]' },
    md: { icon: 36, text: 'text-xl', sub: 'text-[10px]' },
    lg: { icon: 48, text: 'text-3xl', sub: 'text-xs' },
    xl: { icon: 64, text: 'text-5xl', sub: 'text-sm' },
  }

  const s = sizes[size]

  return (
    <div className="flex items-center gap-2.5">
      {/* Icon — animated gradient circle with routing symbol */}
      <div
        className={`relative flex items-center justify-center rounded-xl ${animated ? 'pulse-glow' : ''}`}
        style={{ width: s.icon, height: s.icon }}
      >
        <svg
          width={s.icon}
          height={s.icon}
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="logo-grad" x1="0" y1="0" x2="48" y2="48">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="50%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
            <linearGradient id="logo-inner" x1="12" y1="12" x2="36" y2="36">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.1" />
            </linearGradient>
          </defs>
          {/* Outer ring */}
          <rect x="1" y="1" width="46" height="46" rx="12" fill="url(#logo-inner)" stroke="url(#logo-grad)" strokeWidth="1.5" />
          {/* Routing paths — three curved lines representing carbon routing */}
          <path d="M14 32 C18 28, 22 20, 34 16" stroke="#10b981" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.9" />
          <path d="M14 26 C20 24, 26 22, 34 22" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.7" />
          <path d="M14 20 C18 22, 24 28, 34 28" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.5" />
          {/* Node dots */}
          <circle cx="14" cy="32" r="2.5" fill="#10b981" />
          <circle cx="14" cy="26" r="2" fill="#06b6d4" />
          <circle cx="14" cy="20" r="2" fill="#10b981" opacity="0.6" />
          <circle cx="34" cy="16" r="2.5" fill="#10b981" />
          <circle cx="34" cy="22" r="2" fill="#06b6d4" />
          <circle cx="34" cy="28" r="2" fill="#10b981" opacity="0.6" />
        </svg>
      </div>

      {/* Text logo with proper subscript */}
      {showText && (
        <span className={`font-bold text-white ${s.text} tracking-tight`}>
          CO<sub className={`${s.sub} font-semibold text-emerald-400`} style={{ verticalAlign: 'sub' }}>2</sub>Router
        </span>
      )}
    </div>
  )
}
