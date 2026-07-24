function tokenFromCookieHeader(header = '') {
  const pairs = String(header || '').split(';');
  for (const pair of pairs) {
    const [rawName, ...rawValue] = pair.trim().split('=');
    if (rawName !== 'sb-access-token') continue;
    const value = rawValue.join('=');
    if (!value) return null;
    try { return decodeURIComponent(value); } catch { return value; }
  }
  return null;
}

export function getRequestAuthToken(request) {
  const auth = request?.headers?.get?.('authorization') || '';
  if (auth.startsWith('Bearer ')) {
    const bearer = auth.slice(7).trim();
    if (bearer) return bearer;
  }

  const directCookie = request?.cookies?.get?.('sb-access-token')?.value;
  if (directCookie) return directCookie;

  return tokenFromCookieHeader(request?.headers?.get?.('cookie') || '');
}
