// Content-Security-Policy rollout — REPORT-ONLY for now.
//
// SnapNext loads Stripe, Supabase, the Google/Dropbox/OneDrive pickers and
// presigned S3 media, so an enforced policy that misses one host breaks a real
// user flow silently. Report-only lets violations be observed against every
// provider first. Before launch this must move to the enforced
// `Content-Security-Policy` header — see docs/LAUNCH_READINESS_QA.md.
const cspDirectives = [
  "default-src 'self'",
  // Next.js injects inline bootstrap scripts; Stripe and the Google picker load
  // their own SDKs. Tighten to a nonce before enforcing if practical.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://apis.google.com https://accounts.google.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  // Media and thumbnails arrive from presigned S3 URLs on per-deployment hosts.
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  [
    "connect-src 'self' blob: https: wss:",
  ].join(' '),
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://accounts.google.com https://docs.google.com https://content.dropboxapi.com https://www.dropbox.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy-Report-Only', value: cspDirectives },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self), payment=(self), usb=(), browsing-topics=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-site' },
];

const nextConfig = {
  output: 'standalone',
  eslint: {
    // ESLint reports zero errors, so the build enforces it again. Advisory
    // warnings still surface in the quality workflow without failing anything.
    ignoreDuringBuilds: false,
  },
  typescript: {
    // `npm run typecheck` is clean, so a type error must not be able to reach a
    // production build looking green.
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'avatars.githubusercontent.com', pathname: '/**' },
    ],
  },
  serverExternalPackages: ['mongodb'],
  webpack(config, { dev }) {
    if (dev) {
      config.watchOptions = {
        poll: 2000,
        aggregateTimeout: 300,
        ignored: ['**/node_modules'],
      };
    }
    return config;
  },
  onDemandEntries: {
    maxInactiveAge: 10000,
    pagesBufferLength: 2,
  },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
  async redirects() {
    return [
      { source: '/signin', destination: '/login', permanent: true },
      { source: '/auth/login', destination: '/login', permanent: true },
    ];
  },
};

module.exports = nextConfig;
