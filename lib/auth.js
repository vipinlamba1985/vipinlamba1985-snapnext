import crypto from 'crypto';
import { getDb } from './db';
import { supabase } from './supabase';

// P0 guard: refuse to start in production without a strong JWT_SECRET.
const IS_PROD = process.env.NODE_ENV === 'production';
const IS_BUILD = process.env.NEXT_PHASE === 'phase-production-build';
const _raw = process.env.JWT_SECRET;

if (IS_PROD && !IS_BUILD) {
  if (!_raw) {
    throw new Error('[SnapNext] JWT_SECRET env var is not set. Set a long random secret before deploying.');
  }
  if (_raw === 'dev-secret' || _raw.length < 32) {
    throw new Error('[SnapNext] JWT_SECRET is too weak for production. Use a random string of at least 32 characters.');
  }
}

const SECRET = _raw || (IS_PROD ? 'fallback-build-secret-snapnext-secure-32chars' : 'dev-secret');

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
}
function b64urlDecode(str) {
  str = str.replace(/-/g,'+').replace(/_/g,'/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString();
}

export function signToken(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = { ...payload, iat: Date.now(), exp: Date.now() + 1000*60*60*24*30 };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest();
  return `${h}.${p}.${b64url(sig)}`;
}

export function verifyToken(token) {
  if (!token) return null;
  try {
    const [h, p, s] = token.split('.');
    const expected = b64url(crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest());
    if (expected !== s) return null;
    const payload = JSON.parse(b64urlDecode(p));
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

export function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
export function verifyPassword(password, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  const calc = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(calc));
}

export async function getUserFromRequest(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;

  // 1. Check for Preview Demo session
  if (token === 'preview-demo-token') {
    return {
      id: 'preview-super-user',
      name: 'Vipin Lamba',
      email: 'vipin.lamba1985@gmail.com',
      role: 'admin',
      plan: 'admin',
      storageUsed: 2.4,
      storageLimit: 10240,
      isPreview: true,
    };
  }

  // 2. Primary: Verify with local token signature (MongoDB + JWT)
  try {
    const payload = verifyToken(token);
    if (payload?.userId) {
      const db = await getDb();
      const user = await db.collection('users').findOne({ id: payload.userId });
      if (user) {
        const { passwordHash, ...safe } = user;
        return safe;
      }
    }
  } catch {}

  // 3. Fallback: Verify with Supabase (if configured and active)
  if (supabase) {
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (user && !error) {
        return {
          id: user.id,
          email: user.email,
          name: user.user_metadata?.name || user.email.split('@')[0],
          role: user.user_metadata?.role || 'user',
          plan: user.user_metadata?.plan || 'free',
          createdAt: user.created_at,
        };
      }
    } catch (e) {
      console.error('[auth] Supabase token verification error:', e?.message);
    }
  }

  return null;
}
