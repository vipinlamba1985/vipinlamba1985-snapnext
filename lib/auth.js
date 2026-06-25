import crypto from 'crypto';
import { getDb } from './db';
import { supabaseAdmin, supabase, isSupabaseConfigured } from './supabase';

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

function normalizeSupabaseUser(authUser) {
  if (!authUser) return null;
  const meta = authUser.user_metadata || {};
  const appMeta = authUser.app_metadata || {};
  return {
    id: authUser.id,
    email: authUser.email || '',
    name: meta.name || meta.full_name || authUser.email?.split('@')[0] || 'User',
    plan: appMeta.plan || meta.plan || 'free',
    role: appMeta.role || meta.role || 'user',
    emailVerified: !!authUser.email_confirmed_at,
    emailPrefs: meta.emailPrefs || { product: true, community: true, favorites: true, marketing: false },
    avatarColor: meta.avatarColor || '#a855f7',
    createdAt: authUser.created_at ? new Date(authUser.created_at) : new Date(),
    authProvider: 'supabase',
  };
}

export async function getSupabaseUserFromToken(token) {
  if (!token || !isSupabaseConfigured) return null;
  const client = supabaseAdmin || supabase;
  if (!client?.auth?.getUser) return null;
  try {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user) return null;
    return normalizeSupabaseUser(data.user);
  } catch {
    return null;
  }
}

export async function getUserFromRequest(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  // Primary production auth: Supabase access token. This path must not depend on MongoDB.
  const supabaseUser = await getSupabaseUserFromToken(token);
  if (supabaseUser) return supabaseUser;

  // Temporary legacy fallback for pre-migration custom JWTs. If MongoDB is unavailable,
  // fail closed and return null instead of throwing an HTML/500 response.
  const payload = verifyToken(token);
  if (!payload?.userId) return null;
  try {
    const db = await getDb();
    const user = await db.collection('users').findOne({ id: payload.userId });
    if (!user) return null;
    const { passwordHash, ...safe } = user;
    return safe;
  } catch {
    return null;
  }
}
