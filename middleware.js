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

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Browser requests from unrelated websites must not reach SnapNext APIs.
  // Requests without an Origin header remain allowed for trusted server-to-server integrations.
  if (pathname.startsWith('/api/') && !isAllowedBrowserOrigin(request)) {
    return NextResponse.json(
      { error: { code: 'origin_not_allowed', message: 'Request origin is not allowed.' } },
      { status: 403 },
    );
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
