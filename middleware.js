import { NextResponse } from 'next/server';
import { supabaseServer } from './lib/supabase';

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/upload',
  '/gallery',
  '/memories',
  '/life-graph',
  '/journal',
  '/health',
  '/imports',
  '/ai-studio',
  '/ai-video',
  '/ai-command',
  '/ready-to-post',
  '/favorites',
  '/community',
  '/chat',
  '/downloads',
  '/trash',
  '/billing',
  '/settings',
  '/admin',
  '/support',
];

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const MAX_API_BODY_BYTES = 2 * 1024 * 1024;
const RATE_BUCKETS = globalThis.__snapnextRateBuckets || new Map();
globalThis.__snapnextRateBuckets = RATE_BUCKETS;

// These limits are deliberately generous for normal users. They target only
// unusually rapid, repeated calls to expensive or security-sensitive actions.
const RATE_RULES = [
  { match: /\/(login|signup|password|auth)(\/|$)/i, limit: 20, windowMs: 60_000 },
  { match: /\/(checkout|billing|portal)(\/|$)/i, limit: 20, windowMs: 60_000 },
  { match: /\/(ai|generate|caption|video|protection\/upload)(\/|$)/i, limit: 30, windowMs: 60_000 },
  { match: /\/(reindex|face|people\/reindex)(\/|$)/i, limit: 8, windowMs: 10 * 60_000 },
  { match: /\/(export|stream-zip|downloads\/export)(\/|$)/i, limit: 12, windowMs: 10 * 60_000 },
];

// Preview/demo authentication is a development-only convenience.
// It must NEVER authenticate anyone in production.
function previewAuthAllowed() {
  return process.env.NODE_ENV !== 'production' && process.env.VERCEL_ENV !== 'production';
}

function configuredOrigins() {
  return new Set(
    String(process.env.CORS_ORIGINS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function isAllowedBrowserOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true; // Native apps, webhooks, cron and server-to-server calls commonly omit Origin.

  const allowed = configuredOrigins();
  allowed.add(request.nextUrl.origin);
  allowed.add('https://snapnext.ai');
  allowed.add('https://www.snapnext.ai');

  return allowed.has(origin);
}

function requestClientKey(request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIp = request.headers.get('x-real-ip')?.trim();
  return forwarded || realIp || 'unknown';
}

function matchingRateRule(pathname) {
  return RATE_RULES.find((rule) => rule.match.test(pathname));
}

function checkRateLimit(request, pathname) {
  if (!WRITE_METHODS.has(request.method)) return null;
  const rule = matchingRateRule(pathname);
  if (!rule) return null;

  const now = Date.now();
  const clientKey = requestClientKey(request);
  const routeKey = rule.match.source;
  const key = `${clientKey}:${routeKey}`;
  const existing = RATE_BUCKETS.get(key);

  if (!existing || existing.resetAt <= now) {
    RATE_BUCKETS.set(key, { count: 1, resetAt: now + rule.windowMs });
    return null;
  }

  existing.count += 1;
  if (existing.count <= rule.limit) return null;

  const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  return NextResponse.json(
    { error: { code: 'rate_limited', message: 'Too many requests. Please try again shortly.' } },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  );
}

function rejectOversizedApiRequest(request) {
  if (!WRITE_METHODS.has(request.method)) return null;
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (!Number.isFinite(contentLength) || contentLength <= MAX_API_BODY_BYTES) return null;

  return NextResponse.json(
    { error: { code: 'payload_too_large', message: 'Request is too large.' } },
    { status: 413 },
  );
}

function occasionallyPruneRateBuckets() {
  if (RATE_BUCKETS.size < 1000) return;
  const now = Date.now();
  for (const [key, value] of RATE_BUCKETS) {
    if (value.resetAt <= now) RATE_BUCKETS.delete(key);
  }
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api/')) {
    // Browser requests from unrelated websites must not reach SnapNext APIs.
    // Requests without an Origin header remain allowed for trusted server-to-server integrations.
    if (!isAllowedBrowserOrigin(request)) {
      return NextResponse.json(
        { error: { code: 'origin_not_allowed', message: 'Request origin is not allowed.' } },
        { status: 403 },
      );
    }

    const oversized = rejectOversizedApiRequest(request);
    if (oversized) return oversized;

    occasionallyPruneRateBuckets();
    const rateLimited = checkRateLimit(request, pathname);
    if (rateLimited) return rateLimited;
  }

  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (!isProtected) return NextResponse.next();

  const authHeader = request.headers.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const cookieToken = request.cookies.get('sb-access-token')?.value || null;
  const token = bearer || cookieToken;

  if (token === 'preview-demo-token') {
    // Strictly non-production. In production this token is rejected and the
    // request falls through to the login redirect below (fail closed).
    if (previewAuthAllowed()) return NextResponse.next();
  } else if (token && supabaseServer) {
    try {
      const { data, error } = await supabaseServer.auth.getUser(token);
      if (data?.user && !error) return NextResponse.next();
    } catch {
      // Fail closed: if Supabase verification throws or cannot verify the
      // session, we must NOT allow access to a protected page.
    }
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/api/:path*',
    '/dashboard/:path*',
    '/upload/:path*',
    '/gallery/:path*',
    '/memories/:path*',
    '/life-graph/:path*',
    '/journal/:path*',
    '/health/:path*',
    '/imports/:path*',
    '/ai-studio/:path*',
    '/ai-video/:path*',
    '/ai-command/:path*',
    '/ready-to-post/:path*',
    '/favorites/:path*',
    '/community/:path*',
    '/chat/:path*',
    '/downloads/:path*',
    '/trash/:path*',
    '/billing/:path*',
    '/settings/:path*',
    '/admin/:path*',
    '/support/:path*',
  ],
};