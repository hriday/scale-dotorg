import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Not 'standalone': the image keeps a full node_modules so the entrypoint can
  // run migrations through tsx, and the server runs with `next start`.
  poweredByHeader: false,
}

export default nextConfig
