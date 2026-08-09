const { execFileSync } = require('node:child_process');
const path = require('node:path');

// Vercel currently runs `npm test && next build` directly for this project, so
// package lifecycle hooks are not a reliable place to stage runtime assets.
// Prepare pinned MediaPipe files before Next snapshots public/ into the build.
if (process.env.NODE_ENV === 'production' && process.env.SKIP_MEDIAPIPE_ASSET_PREP !== '1') {
  execFileSync(process.execPath, [path.join(process.cwd(), 'scripts', 'prepare-mediapipe-assets.mjs')], {
    stdio: 'inherit',
  });
}

const securityHeaders = [
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
    // Kept temporarily until the non-blocking quality workflow reaches zero findings.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Kept temporarily until the non-blocking quality workflow reaches zero findings.
    ignoreBuildErrors: true,
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
