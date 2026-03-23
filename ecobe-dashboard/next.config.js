/** @type {import('next').NextConfig} */
const ECOBE_ENGINE_URL = process.env.ECOBE_API_URL || 'https://ecobe-engineclaude-production.up.railway.app'

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  env: {
    ECOBE_API_URL: ECOBE_ENGINE_URL,
  },
  async rewrites() {
    return [
      {
        source: '/api/ecobe/:path*',
        destination: `${ECOBE_ENGINE_URL}/api/v1/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
