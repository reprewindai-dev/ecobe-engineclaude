/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    outputFileTracingIncludes: {
      '*': ['public/**/*', '.next/static/**/*'],
    },
  },
  // Add any other Next.js config options here
}

module.exports = nextConfig
