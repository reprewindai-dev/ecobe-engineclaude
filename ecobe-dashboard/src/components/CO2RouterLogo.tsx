'use client'

import Image from 'next/image'

type CO2RouterLogoProps = {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showText?: boolean
  animated?: boolean
  orientation?: 'auto' | 'lockup' | 'stacked'
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

const lockupSymbolHeights: Record<NonNullable<CO2RouterLogoProps['size']>, string> = {
  sm: 'h-9',
  md: 'h-11',
  lg: 'h-14',
  xl: 'h-18',
}

const wordmarkClasses: Record<NonNullable<CO2RouterLogoProps['size']>, string> = {
  sm: 'text-[1.65rem]',
  md: 'text-[2rem]',
  lg: 'text-[2.45rem]',
  xl: 'text-[3rem]',
}

const subscriptClasses: Record<NonNullable<CO2RouterLogoProps['size']>, string> = {
  sm: 'text-[0.58em] align-[-0.42em]',
  md: 'text-[0.58em] align-[-0.44em]',
  lg: 'text-[0.58em] align-[-0.48em]',
  xl: 'text-[0.58em] align-[-0.52em]',
}

export function CO2RouterLogo({
  size = 'md',
  showText = true,
  animated = true,
  orientation = 'auto',
}: CO2RouterLogoProps) {
  const src = showText ? '/co2router-logo.png' : '/co2router-symbol.png'
  const heightClass = showText ? imageHeights[size] : symbolHeights[size]
  const resolvedOrientation =
    orientation === 'auto' ? (showText && (size === 'sm' || size === 'md') ? 'lockup' : 'stacked') : orientation
  const glowClass = animated ? 'drop-shadow-[0_0_24px_rgba(109,225,255,0.2)]' : ''

  if (showText && resolvedOrientation === 'lockup') {
    return (
      <div className="flex items-center gap-3 shrink-0">
        <Image
          src="/co2router-symbol.png"
          alt=""
          aria-hidden="true"
          width={564}
          height={390}
          className={`${lockupSymbolHeights[size]} w-auto shrink-0 ${glowClass}`}
          draggable="false"
        />
        <div
          aria-label="CO2 Router"
          className={`${wordmarkClasses[size]} font-black leading-none tracking-[-0.08em] text-white`}
        >
          CO<sub className={subscriptClasses[size]}>2</sub>Router
        </div>
      </div>
    )
  }

  return (
    <Image
      src={src}
      alt="CO2 Router"
      width={showText ? 1024 : 564}
      height={showText ? 1024 : 390}
      className={`${heightClass} w-auto shrink-0 ${glowClass}`}
      draggable="false"
    />
  )
}
