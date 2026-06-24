import crypto from 'crypto';

const SECRET = process.env.JWT_SECRET || 'dev-secret';

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString();
}

// Signed opaque token used for one-click unsubscribe.
// Encodes minimal claims: { uid, exp }. Does not embed the email address.
export function signUnsubToken(payload, ttlSec = 60 * 60 * 24 * 365 * 2) {
  const body = { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + ttlSec };
  const p = b64url(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', SECRET).update(`u.${p}`).digest();
  return `${p}.${b64url(sig)}`;
}

export function verifyUnsubToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [p, s] = token.split('.');
  if (!p || !s) return null;
  try {
    const expected = b64url(crypto.createHmac('sha256', SECRET).update(`u.${p}`).digest());
    if (expected !== s) return null;
    const body = JSON.parse(b64urlDecode(p));
    if (body.exp && body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch { return null; }
}
