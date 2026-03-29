'use client'

type CO2RouterLogoProps = {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showText?: boolean
  animated?: boolean
}

const imageHeights: Record<NonNullable<CO2RouterLogoProps['size']>, string> = {
  sm: 'h-9',
  md: 'h-12',
  lg: 'h-16',
  xl: 'h-24',
}

const symbolHeights: Record<NonNullable<CO2RouterLogoProps['size']>, string> = {
  sm: 'h-8',
  md: 'h-10',
  lg: 'h-14',
  xl: 'h-20',
}

export function CO2RouterLogo({
  size = 'md',
  showText = true,
  animated = true,
}: CO2RouterLogoProps) {
  const src = showText ? '/co2router-logo.png' : '/co2router-symbol.png'
  const heightClass = showText ? imageHeights[size] : symbolHeights[size]

  return (
    <img
      src={src}
      alt="CO2 Router"
      className={`${heightClass} w-auto shrink-0 ${animated ? 'drop-shadow-[0_0_24px_rgba(109,225,255,0.2)]' : ''}`}
      decoding="async"
      draggable="false"
    />
  )
}
