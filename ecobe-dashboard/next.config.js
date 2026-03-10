/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    ECOBE_API_URL: process.env.ECOBE_API_URL || 'http://localhost:3000',
  },
  async rewrites() {
    return [
      {
        source: '/api/ecobe/:path*',
        destination: `${process.env.ECOBE_API_URL || 'http://localhost:3000'}/api/v1/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
