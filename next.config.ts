import type { NextConfig } from 'next';
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Strip console.log/warn in production (keep console.error)
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error'] }
      : false,
  },

  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
  },

  // Enable gzip/brotli compression & tree-shaking
  compress: true,

  // API response headers
  headers: async () => [
    {
      source: '/api/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Vary', value: 'Accept-Encoding' },
      ],
    },
  ],

  experimental: {
    optimizePackageImports: ['zustand', 'zod', 'openai'],
  },
};

export default withBundleAnalyzer(nextConfig);
