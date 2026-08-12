// Content-Security-Policy rollout.
//
// Launch gets an enforced compatibility-first baseline so SnapNext has a real
// browser security boundary without risking checkout/cloud flows on an untested
// narrow frame allowlist. A second, tighter policy remains report-only; signed-in
// provider QA can use its violations to safely narrow the enforced policy later.
const cspBaselineDirectives = [
  "default-src 'self'",
  // Next.js currently needs inline bootstrap code. Google Picker may load helper
  // scripts from Google/gstatic, while Stripe may load Stripe.js.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://*.google.com https://*.gstatic.com",
  "style-src 'self' 'unsafe-inline' https:",
  "font-src 'self' data: https:",
  // User media and thumbnails can arrive from presigned HTTPS object URLs.
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self' blob: https: wss:",
  // Provider authorization/selection surfaces are HTTPS. Keep this broad in the
  // enforced baseline; the report-only policy below records where it can tighten.
  "frame-src 'self' https:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https:",
  "frame-ancestors 'none'",
].join('; ');

const cspStrictReportOnlyDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://apis.google.com https://accounts.google.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self' blob: https: wss:",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://accounts.google.com https://docs.google.com https://content.dropboxapi.com https://www.dropbox.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: cspBaselineDirectives },
  { key: 'Content-Security-Policy-Report-Only', value: cspStrictReportOnlyDirectives },
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
  // Next 16 no longer accepts nextConfig.eslint and no longer runs ESLint from
  // `next build`. package.json keeps lint and typecheck as explicit blocking
  // build steps so production cannot bypass the quality gate.
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'avatars.githubusercontent.com', pathname: '/**' },
    ],
  },
  serverExternalPackages: ['mongodb'],
  // Keep Webpack during the framework-major migration. This block only exists
  // for development watch behaviour, and package scripts pass --webpack
  // explicitly so Next 16's Turbopack default cannot silently ignore it.
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

// Vercel currently runs the repository build script for this project, so
// package lifecycle hooks are not a reliable place to stage runtime assets.
// Prepare pinned MediaPipe files before Next snapshots public/ into the build.
if (process.env.NODE_ENV === 'production' && process.env.SKIP_MEDIAPIPE_ASSET_PREP !== '1') {
  const { execFileSync } = require('node:child_process');
  const path = require('node:path');
  execFileSync(process.execPath, [path.join(process.cwd(), 'scripts', 'prepare-mediapipe-assets.mjs')], {
    stdio: 'inherit',
  });
}
