import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from './db';
import { supabaseServer, supabaseAdmin } from './supabase';
import { getRequestAuthToken } from './auth-request-token.js';

// Legacy JWT/password helpers are retained only to validate pre-migration sessions during rollout.
const IS_PROD = process.env.NODE_ENV === 'production';
const _raw = process.env.JWT_SECRET;

// SECURITY: in production the legacy token path is only usable with a real,
// strong JWT_SECRET. A publicly known fallback secret would let anyone forge
// legacy session tokens, so if the secret is missing or weak we disable
// legacy signing/verification entirely (fail closed).
const LEGACY_TOKENS_ENABLED = IS_PROD ? (typeof _raw === 'string' && _raw.length >= 32) : true;
const SECRET = _raw || 'dev-secret';

// Emergency recovery is opt-in through Vercel configuration. There is no
// built-in owner email: normal admin access comes from the persisted user role
// and trusted Supabase app_metadata.
const EMERGENCY_OWNER_EMAILS = new Set(
  String(process.env.SNAPNEXT_OWNER_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

function emergencyOwnerOverride(email) {
  const normalized = String(email || '').toLowerCase();
  return EMERGENCY_OWNER_EMAILS.has(normalized) ? { role: 'admin', plan: 'super_user' } : null;
}

async function syncEmergencyOwnerSupabaseMetadata(supabaseUser, owner) {
  if (!owner || !supabaseAdmin || !supabaseUser?.id) return;
  const userMetadata = supabaseUser.user_metadata || {};
  const appMetadata = supabaseUser.app_metadata || {};
  const alreadySynced = userMetadata.plan === owner.plan && userMetadata.role === owner.role && appMetadata.plan === owner.plan && appMetadata.role === owner.role;
  if (alreadySynced) return;
  try {
    await supabaseAdmin.auth.admin.updateUserById(supabaseUser.id, {
      user_metadata: { ...userMetadata, plan: owner.plan, role: owner.role, snapnext_owner: true },
      app_metadata: { ...appMetadata, plan: owner.plan, role: owner.role, snapnext_owner: true },
    });
  } catch (error) {
    console.error('[auth] Emergency owner Supabase metadata sync failed:', error?.message);
  }
}

// Preview/demo authentication is a development-only convenience.
// It must NEVER authenticate anyone in production.
export function isPreviewAuthAllowed() {
  return process.env.NODE_ENV !== 'production' && process.env.VERCEL_ENV !== 'production';
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
}
function b64urlDecode(str) {
  str = str.replace(/-/g,'+').replace(/_/g,'/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString();
}

export function signToken(payload) {
  if (!LEGACY_TOKENS_ENABLED) {
    throw new Error('Legacy token signing is disabled. Configure a strong JWT_SECRET (32+ characters).');
  }
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = { ...payload, iat: Date.now(), exp: Date.now() + 1000*60*60*24*30 };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest();
  return `${h}.${p}.${b64url(sig)}`;
}

export function verifyToken(token) {
  if (!token || !LEGACY_TOKENS_ENABLED) return null;
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
  const appMetadata = supabaseUser?.app_metadata || {};
  const emergencyOwner = emergencyOwnerOverride(email);
  return {
    id: existing?.id,
    supabaseUserId: supabaseUser?.id,
    email,
    name: existing?.name || metadata.name || metadata.full_name || email.split('@')[0] || 'User',
    plan: emergencyOwner?.plan || existing?.plan || appMetadata.plan || metadata.plan || 'free',
    role: emergencyOwner?.role || existing?.role || appMetadata.role || metadata.role || 'user',
    emailVerified: !!(supabaseUser?.email_confirmed_at || existing?.emailVerified),
    updatedAt: new Date(),
  };
}

export async function syncSupabaseUserToAppUser(db, supabaseUser) {
  if (!supabaseUser?.id || !supabaseUser?.email) return null;
  const now = new Date();
  const email = supabaseUser.email.toLowerCase();
  const metadata = supabaseUser?.user_metadata || {};
  const appMetadata = supabaseUser?.app_metadata || {};
  const existing = await db.collection('users').findOne({
    $or: [{ supabaseUserId: supabaseUser.id }, { email }],
  });

  const emergencyOwner = emergencyOwnerOverride(email);
  await syncEmergencyOwnerSupabaseMetadata(supabaseUser, emergencyOwner);
  const name = existing?.name || metadata.name || metadata.full_name || email.split('@')[0] || 'User';
  const plan = emergencyOwner?.plan || existing?.plan || appMetadata.plan || metadata.plan || 'free';
  const role = emergencyOwner?.role || existing?.role || appMetadata.role || metadata.role || 'user';
  const filter = existing?.id ? { id: existing.id } : { supabaseUserId: supabaseUser.id };

  await db.collection('users').updateOne(
    filter,
    {
      $set: {
        email,
        name,
        supabaseUserId: supabaseUser.id,
        plan,
        role,
        emailVerified: !!(supabaseUser.email_confirmed_at || existing?.emailVerified),
        updatedAt: now,
      },
      $setOnInsert: {
        id: uuidv4(),
        createdAt: supabaseUser.created_at ? new Date(supabaseUser.created_at) : now,
        emailPrefs: { product: true, community: true, favorites: true, marketing: false },
        avatarColor: ['#a855f7','#ec4899','#6366f1','#10b981','#f59e0b'][Math.floor(Math.random()*5)],
      },
    },
    { upsert: true },
  );

  const synced = await db.collection('users').findOne({ supabaseUserId: supabaseUser.id });
  if (!synced) return null;
  const { _id, passwordHash, ...safe } = synced;
  return safe;
}

export async function getUserFromRequest(request) {
  const token = getRequestAuthToken(request);
  if (!token) return null;

  // 1. Preview demo session — development-only. In production this token is
  //    always rejected (fail closed); it must never authenticate real traffic.
  if (token === 'preview-demo-token') {
    if (!isPreviewAuthAllowed()) return null;
    return {
      id: 'preview-super-user',
      name: 'Vipin Lamba',
      email: 'vipin.lamba1985@gmail.com',
      role: 'admin',
      plan: 'super_user',
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
        const emergencyOwner = emergencyOwnerOverride(user.email);
        const patched = emergencyOwner ? { ...user, ...emergencyOwner } : user;
        const { passwordHash, ...safe } = patched;
        return safe;
      }
    }
  } catch { return null; }

  return null;
}
