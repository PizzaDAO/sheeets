import type { NextConfig } from "next";

// Content-Security-Policy, currently shipped in REPORT-ONLY mode. Violations
// are POSTed to /api/csp-report and logged as `[csp]` lines in Vercel logs.
// Once a week or so of logs is clean, rename the header below to
// `Content-Security-Policy` to enforce.
//
// 'unsafe-inline' in script-src covers Next's inline bootstrap/RSC payload
// scripts, the theme script + JSON-LD in layout.tsx, and the inline gtag
// config. Moving to nonces would require a proxy (middleware) and dynamic
// rendering for every page, so it is deliberately out of scope for now.
const csp = [
  "default-src 'self'",
  [
    "script-src 'self' 'unsafe-inline'",
    // Google Analytics (gtag) + Google Maps/Places + Google Identity Services
    'https://www.googletagmanager.com',
    'https://*.googletagmanager.com',
    'https://maps.googleapis.com',
    'https://accounts.google.com',
    // Chart.js on /admin/analytics
    'https://cdn.jsdelivr.net',
    // Vercel toolbar / analytics on preview deployments
    'https://vercel.live',
  ].join(' '),
  [
    "connect-src 'self'",
    'https://*.supabase.co',
    'wss://*.supabase.co',
    'https://api.mapbox.com',
    'https://events.mapbox.com',
    'https://*.google-analytics.com',
    'https://*.analytics.google.com',
    'https://www.google.com',
    'https://*.googletagmanager.com',
    'https://maps.googleapis.com',
    'https://places.googleapis.com',
    'https://accounts.google.com',
    'https://www.googleapis.com',
    'https://cdn.jsdelivr.net',
    'https://vercel.live',
    'wss://ws-us3.pusher.com',
  ].join(' '),
  "img-src 'self' data: blob: https:",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com https://vercel.live",
  [
    "frame-src 'self'",
    'https://lu.ma',
    'https://luma.com',
    'https://*.luma.com',
    'https://accounts.google.com',
    'https://vercel.live',
  ].join(' '),
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self' https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  'report-uri /api/csp-report',
  'report-to csp-endpoint',
].join('; ');

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
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'geolocation=(self)' },
          { key: 'Reporting-Endpoints', value: 'csp-endpoint="/api/csp-report"' },
          { key: 'Content-Security-Policy-Report-Only', value: csp },
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
