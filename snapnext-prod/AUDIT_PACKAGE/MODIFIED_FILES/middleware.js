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

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (!isProtected) return NextResponse.next();

  const authHeader = request.headers.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const cookieToken = request.cookies.get('sb-access-token')?.value || null;
  const token = bearer || cookieToken;

  // ---------------------------------------------------------------------
  // SECURITY: preview-demo-token bypass
  // ---------------------------------------------------------------------
  // The `preview-demo-token` bypass exists so reviewers and internal QA
  // can walk the authenticated shell without a real Supabase session.
  //
  // It is a HARD launch blocker if this bypass reaches production because
  // anyone knowing the token string can access every protected route as
  // a super-user shadow of the account owner.
  //
  // Rule: this bypass is only honoured when NODE_ENV !== 'production'
  // (i.e. `dev`, `test`, and Emergent preview builds). In production the
  // request falls through to Supabase validation like any other token.
  //
  // Do NOT relax this without a full security review.
  if (
    token === 'preview-demo-token' &&
    process.env.NODE_ENV !== 'production'
  ) {
    return NextResponse.next();
  }

  if (token && supabaseServer) {
    try {
      const { data, error } = await supabaseServer.auth.getUser(token);
      if (data?.user && !error) return NextResponse.next();
    } catch {
      return NextResponse.next();
    }
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
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
