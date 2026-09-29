import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/avatars/**',
      },
      {
        protocol: 'https',
        hostname: 'unavatar.io',
      },
    ],
  },
  async headers() {
    // Baseline security headers. The app is never embedded by third parties
    // (it only embeds Luma iframes itself), so SAMEORIGIN framing is safe.
    // TODO: add a Content-Security-Policy once it can be tested against
    // Mapbox, Google Analytics, Supabase, Luma embeds and inline scripts.
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'geolocation=(self)' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/data',
        destination: 'https://docs.google.com/spreadsheets/d/1xWmIHyEyOmPHfkYuZkucPRlLGWbb9CF6Oqvfl8FUV6k/edit?gid=377806756#gid=377806756',
        permanent: false,
      },
      {
        source: '/miami',
        destination: '/consensus',
        permanent: false,
      },
      {
        source: '/nyc',
        destination: '/nytechweek',
        permanent: false,
      },
      {
        source: '/toronto',
        destination: '/ttw',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
