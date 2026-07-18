import { NextResponse } from 'next/server';
import { distributedRateLimit } from './lib/distributed-rate-limit';

const PROTECTED_PREFIXES = [
  '/dashboard','/upload','/gallery','/memories','/life-graph','/journal','/health','/imports',
  '/ai-studio','/ai-video','/ai-command','/ready-to-post','/favorites','/community','/chat',
  '/downloads','/trash','/billing','/settings','/admin','/support',
];
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const MAX_API_BODY_BYTES = 2 * 1024 * 1024;
const RATE_RULES = [
  { match: /\/(login|signup|password|auth)(\/|$)/i, limit: 20, windowMs: 60_000 },
  { match: /\/(checkout|billing|portal)(\/|$)/i, limit: 20, windowMs: 60_000 },
  { match: /\/(ai|generate|caption|video|protection\/upload)(\/|$)/i, limit: 30, windowMs: 60_000 },
  { match: /\/(reindex|face|people\/reindex)(\/|$)/i, limit: 8, windowMs: 600_000 },
  { match: /\/(export|stream-zip|downloads\/export)(\/|$)/i, limit: 12, windowMs: 600_000 },
];

function createRequestId(request) {
  const incoming = request.headers.get('x-request-id')?.trim();
  return incoming && /^[a-zA-Z0-9._:-]{8,128}$/.test(incoming) ? incoming : crypto.randomUUID();
}
function attachRequestId(response, requestId) {
  response.headers.set('x-request-id', requestId);
  return response;
}
function continueWithRequestId(request, requestId) {
  const headers = new Headers(request.headers);
  headers.set('x-request-id', requestId);
  return attachRequestId(NextResponse.next({ request: { headers } }), requestId);
}
function logSecurityEvent(level, event, details) {
  const payload = JSON.stringify({ timestamp: new Date().toISOString(), event, ...details });
  if (level === 'error') console.error(payload);
  else if (level === 'warn') console.warn(payload);
  else console.info(payload);
}
function previewAuthAllowed() {
  return process.env.NODE_ENV !== 'production' && process.env.VERCEL_ENV !== 'production';
}
function configuredOrigins(request) {
  const allowed = new Set(String(process.env.CORS_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean));
  allowed.add(request.nextUrl.origin);
  return allowed;
}
function isAllowedBrowserOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || configuredOrigins(request).has(origin);
}
function requestClientKey(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || 'unknown';
}
function matchingRateRule(pathname) {
  return RATE_RULES.find((rule) => rule.match.test(pathname));
}
function rejectOversizedApiRequest(request) {
  if (!WRITE_METHODS.has(request.method)) return null;
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (!Number.isFinite(contentLength) || contentLength <= MAX_API_BODY_BYTES) return null;
  return NextResponse.json({ error: { code: 'payload_too_large', message: 'Request is too large.' } }, { status: 413 });
}
function rejectInvalidContentType(request, pathname) {
  if (!WRITE_METHODS.has(request.method)) return null;
  const type = (request.headers.get('content-type') || '').toLowerCase();
  const uploadRoute = pathname.includes('/upload') || pathname.includes('/multipart');
  if (uploadRoute) {
    if (type.startsWith('multipart/form-data') || type.startsWith('application/json')) return null;
  } else if (type.startsWith('application/json') || type.startsWith('application/x-www-form-urlencoded')) {
    return null;
  }
  return NextResponse.json(
    { error: { code: 'unsupported_media_type', message: 'Unsupported request content type.' } },
    { status: 415 },
  );
}
async function checkRateLimit(request, pathname) {
  if (!WRITE_METHODS.has(request.method)) return null;
  const rule = matchingRateRule(pathname);
  if (!rule) return null;
  const result = await distributedRateLimit({
    key: `${requestClientKey(request)}:${rule.match.source}`,
    limit: rule.limit,
    windowMs: rule.windowMs,
  });
  if (result.allowed) return null;
  const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  return NextResponse.json(
    { error: { code: 'rate_limited', message: 'Too many requests. Please try again shortly.' } },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
        'X-RateLimit-Backend': result.backend,
      },
    },
  );
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  const requestId = createRequestId(request);

  if (pathname.startsWith('/api/')) {
    if (!isAllowedBrowserOrigin(request)) {
      logSecurityEvent('warn', 'api_origin_rejected', { requestId, method: request.method, pathname });
      return attachRequestId(
        NextResponse.json({ error: { code: 'origin_not_allowed', message: 'Request origin is not allowed.' } }, { status: 403 }),
        requestId,
      );
    }
    const oversized = rejectOversizedApiRequest(request);
    if (oversized) return attachRequestId(oversized, requestId);
    const invalidType = rejectInvalidContentType(request, pathname);
    if (invalidType) return attachRequestId(invalidType, requestId);
    const rateLimited = await checkRateLimit(request, pathname);
    if (rateLimited) {
      logSecurityEvent('warn', 'api_rate_limited', { requestId, method: request.method, pathname });
      return attachRequestId(rateLimited, requestId);
    }
  }

  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (!isProtected) return continueWithRequestId(request, requestId);

  const authHeader = request.headers.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const token = bearer || request.cookies.get('sb-access-token')?.value || null;

  if (token === 'preview-demo-token') {
    if (previewAuthAllowed()) return continueWithRequestId(request, requestId);
  } else if (token) {
    // Page navigation only requires a session token to be present. Protected APIs
    // and /api/auth/me remain responsible for authoritative token validation.
    return continueWithRequestId(request, requestId);
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', pathname);
  return attachRequestId(NextResponse.redirect(loginUrl), requestId);
}

export const config = { matcher: [
  '/api/:path*','/dashboard/:path*','/upload/:path*','/gallery/:path*','/memories/:path*',
  '/life-graph/:path*','/journal/:path*','/health/:path*','/imports/:path*','/ai-studio/:path*',
  '/ai-video/:path*','/ai-command/:path*','/ready-to-post/:path*','/favorites/:path*',
  '/community/:path*','/chat/:path*','/downloads/:path*','/trash/:path*','/billing/:path*',
  '/settings/:path*','/admin/:path*','/support/:path*',
] };
