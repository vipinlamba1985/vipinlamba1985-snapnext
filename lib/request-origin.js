// Resolves the set of origins a browser request may legitimately carry.
//
// `request.nextUrl.origin` cannot be used for this on its own. In a self-hosted
// Node server it resolves to a literal `http://localhost:<port>` — it ignores
// both the real Host header and any reverse-proxy forwarding headers. Comparing
// a real browser Origin against that value rejects every same-origin write:
// a browser on https://example.com sends that as its Origin, which never
// matches `http://localhost:3000`, so login, signup, upload and checkout all
// fail with origin_not_allowed before reaching a route handler.
//
// This check is a browser CSRF guard. A non-browser client can already bypass
// it by omitting Origin entirely, so deriving the expected origin from the
// forwarded host does not weaken it — browsers set Origin themselves and
// scripts cannot forge it.

function firstValue(value) {
  return String(value || '').split(',')[0].trim();
}

export function parseConfiguredOrigins(configured) {
  return String(configured || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

/**
 * Build the allow-list of acceptable browser Origin values.
 *
 * `configured` (CORS_ORIGINS) always wins and is additive. The request's own
 * public origin is derived from the proxy forwarding headers when present so
 * that same-origin traffic is accepted without any configuration.
 */
export function resolveAllowedOrigins({
  configured,
  forwardedHost,
  host,
  forwardedProto,
  fallbackProtocol,
} = {}) {
  const allowed = new Set(parseConfiguredOrigins(configured));

  const resolvedHost = firstValue(forwardedHost) || firstValue(host);
  if (resolvedHost) {
    // Prefer the proxy's scheme, then the scheme the server itself saw, and
    // only then assume TLS. Getting this wrong in either direction produces a
    // scheme mismatch that reads exactly like a blocked origin.
    const protocol = (firstValue(forwardedProto) || String(fallbackProtocol || '').replace(/:$/, '') || 'https')
      .toLowerCase();
    allowed.add(`${protocol}://${resolvedHost}`);
  }

  return allowed;
}

export function isAllowedOrigin(origin, allowedOrigins) {
  // Missing Origin means a non-browser client; those are authenticated and
  // rate-limited elsewhere rather than blocked here.
  if (!origin) return true;
  return allowedOrigins.has(origin);
}
