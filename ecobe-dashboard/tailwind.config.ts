import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        carbon: {
          low: '#10b981',
          medium: '#f59e0b',
          high: '#ef4444',
        },
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        mission: {
          deep: '#050A1A',
          ocean: '#08122C',
          aqua: '#38bdf8',
          orb: '#0ea5e9',
          emerald: '#34d399',
          neon: '#22d3ee',
        },
      },
      boxShadow: {
        'mission-glow': '0 25px 80px -35px rgba(56, 189, 248, 0.45)',
        'mission-card': '0 14px 45px -20px rgba(45, 212, 191, 0.4)',
      },
      backgroundImage: {
        'mission-grid':
          'radial-gradient(circle at center, rgba(56, 189, 248, 0.12) 0, transparent 50%)',
        'mission-radial':
          'radial-gradient(circle at top, rgba(34, 211, 238, 0.25), transparent 55%)',
      },
      animation: {
        'mission-pulse': 'missionPulse 6s ease-in-out infinite',
        'mission-orbit': 'missionOrbit 18s linear infinite',
        'mission-flow': 'missionFlow 8s ease-in-out infinite',
        'mission-float': 'missionFloat 14s ease-in-out infinite',
        'mission-spin-slow': 'spin 24s linear infinite',
      },
      keyframes: {
        missionPulse: {
          '0%, 100%': { transform: 'scale(0.98)', filter: 'brightness(0.85)' },
          '50%': { transform: 'scale(1.02)', filter: 'brightness(1.15)' },
        },
        missionOrbit: {
          '0%': { transform: 'rotate(0deg) translateX(6px) rotate(0deg)' },
          '100%': { transform: 'rotate(360deg) translateX(6px) rotate(-360deg)' },
        },
        missionFlow: {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        missionFloat: {
          '0%, 100%': { transform: 'translateY(0px) scale(1)' },
          '50%': { transform: 'translateY(-12px) scale(1.02)' },
        },
      },
    },
  },
  plugins: [],
}
export default config
