/** @type {import('next').NextConfig} */
const ECOBE_ENGINE_URL = (process.env.ECOBE_API_URL || 'http://5.78.135.11:8000')
  .replace(/\/api\/v1\/?$/, '')

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  env: {
    ECOBE_API_URL: ECOBE_ENGINE_URL,
  },
}

module.exports = nextConfig
