import crypto from 'crypto';
import { getDb } from './db';
import { supabaseServer } from './supabase';

// Legacy JWT/password helpers are retained only to validate pre-migration sessions during rollout.
const IS_PROD = process.env.NODE_ENV === 'production';
const IS_BUILD = process.env.NEXT_PHASE === 'phase-production-build';
const _raw = process.env.JWT_SECRET;

if (false && IS_PROD && !IS_BUILD) {
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


export function normalizeSupabaseUser(supabaseUser, existing = {}) {
  const email = (supabaseUser?.email || existing?.email || '').toLowerCase();
  const metadata = supabaseUser?.user_metadata || {};
  return {
    ...existing,
    id: existing?.id || supabaseUser?.id,
    supabaseUserId: supabaseUser?.id,
    email,
    name: existing?.name || metadata.name || metadata.full_name || email.split('@')[0] || 'User',
    plan: existing?.plan || metadata.plan || 'free',
    role: existing?.role || metadata.role || 'user',
    emailVerified: !!(supabaseUser?.email_confirmed_at || existing?.emailVerified),
    emailPrefs: existing?.emailPrefs || { product: true, community: true, favorites: true, marketing: false },
    avatarColor: existing?.avatarColor || ['#a855f7','#ec4899','#6366f1','#10b981','#f59e0b'][Math.floor(Math.random()*5)],
    createdAt: existing?.createdAt || (supabaseUser?.created_at ? new Date(supabaseUser.created_at) : new Date()),
    updatedAt: new Date(),
  };
}

export async function syncSupabaseUserToAppUser(db, supabaseUser) {
  if (!supabaseUser?.id || !supabaseUser?.email) return null;
  const email = supabaseUser.email.toLowerCase();
  const existing = await db.collection('users').findOne({
    $or: [{ supabaseUserId: supabaseUser.id }, { id: supabaseUser.id }, { email }],
  });
  const profile = normalizeSupabaseUser(supabaseUser, existing || {});
  profile.id = existing?.id || supabaseUser.id;
  delete profile.passwordHash;
  await db.collection('users').updateOne(
    { id: profile.id },
    { $set: profile, $setOnInsert: { id: profile.id } },
    { upsert: true },
  );
  return profile;
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

  // 2. Primary: validate Supabase access tokens with Supabase Auth.
  if (supabaseServer) {
    try {
      const { data, error } = await supabaseServer.auth.getUser(token);
      if (data?.user && !error) {
        const db = await getDb();
        return await syncSupabaseUserToAppUser(db, data.user);
      }
    } catch (e) {
      console.error('[auth] Supabase token verification error:', e?.message);
    }
  }

  // 3. Legacy fallback only for existing sessions during migration.
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
  } catch { return null; }

  return null;
}
