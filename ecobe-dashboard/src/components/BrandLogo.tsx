import Image from 'next/image'

type BrandLogoProps = {
  variant?: 'full' | 'icon'
  className?: string
  alt?: string
}

export function BrandLogo({
  variant = 'full',
  className = '',
  alt = 'CO2 Router',
}: BrandLogoProps) {
  const src = variant === 'icon' ? '/co2router-symbol.png' : '/co2router-logo.png'
  const dimensions =
    variant === 'icon'
      ? { width: 564, height: 390 }
      : { width: 1024, height: 1024 }

  return (
    <Image
      src={src}
      alt={alt}
      width={dimensions.width}
      height={dimensions.height}
      className={className}
      draggable={false}
    />
  )
}
