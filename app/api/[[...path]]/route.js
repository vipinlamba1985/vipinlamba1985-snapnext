import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { getDb } from '@/lib/db';
import { getUserFromRequest, syncSupabaseUserToAppUser, isPreviewAuthAllowed } from '@/lib/auth';
import { supabaseServer, supabaseAdmin, isSupabaseConfigured, hasSupabaseServiceRole } from '@/lib/supabase';
import { PLANS, applyStorageSimulation, effectivePlan, entitlementForUser, isSuperUser } from '@/lib/entitlements';
import { storage } from '@/lib/storage';
import { analyzeImage, analyzeVideo, transcribeAudio } from '@/lib/gemini';
import { runAiTask, getAiEntitlement, getAiUsageSummary, preflightAiRequest } from '@/lib/ai-router';
import { sendEmail, recordWebhookEvent, hasRealProvider, isProduction } from '@/lib/email';
import { verifyUnsubToken } from '@/lib/email/tokens';
import { billing } from '@/lib/billing';
import { getFavoriteLink, setPerms, canViewOwnersResource, listAcceptedFavoriteUserIds, notify, FAVORITE_PERM_KEYS } from '@/lib/favorites';
import { runExportJob, cleanupExpiredExports, createJob, EXPORT_DIR } from '@/lib/exports';
import { computeInsights } from '@/lib/insights';
import fs from 'fs';

export const runtime = 'nodejs';

function cors(res) {
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return res;
}
function json(data, status = 200) { return cors(NextResponse.json(data, { status })); }
function clean(doc) { if (!doc) return doc; const { _id, passwordHash, ...rest } = doc; return rest; }
function aiJson(result) {
  if (!result.ok) return json({ error: result.error }, result.status || 400);
  return json(result);
}

function readAiResult(result, key) {
  return result?.result?.[key] ?? result?.result ?? null;
}




function safeStorageError(error) {
  const message = error?.message || String(error || 'Unknown storage error');
  const code = error?.name || error?.Code || error?.code || 'StorageError';
  const lower = message.toLowerCase();
  let reason = 'storage_unavailable';
  let userMessage = 'Upload service temporarily unavailable.';
  let retryable = true;
  let component = storage.active() === 's3' ? 'aws_s3' : 'local_storage';

  if (lower.includes('missing') || lower.includes('not configured') || lower.includes('aws s3 not configured')) {
    reason = 'cloud_storage_unavailable';
    userMessage = 'Cloud storage is not configured.';
    retryable = false;
  } else if (lower.includes('accessdenied') || lower.includes('forbidden') || lower.includes('permission')) {
    reason = 'storage_permission_denied';
    userMessage = 'Cloud storage permissions are blocking this upload.';
    retryable = false;
  } else if (lower.includes('network') || lower.includes('timeout') || lower.includes('temporarily') || lower.includes('socket')) {
    reason = 'connection_lost';
    userMessage = 'Connection lost while saving this file.';
    retryable = true;
  } else if (lower.includes('nosuchbucket') || lower.includes('bucket')) {
    reason = 'bucket_unavailable';
    userMessage = 'Cloud storage bucket is unavailable.';
    retryable = false;
  }

  return { reason, message: userMessage, technical: message, code, component, retryable };
}

export async function OPTIONS() { return cors(new NextResponse(null, { status: 200 })); }

async function requireUser(request) {
  const u = await getUserFromRequest(request);
  if (!u) return null;
  return u;
}

async function getStorageUsage(db, userId) {
  const agg = await db.collection('media').aggregate([
    { $match: { userId, trashed: { $ne: true } } },
    { $group: { _id: null, total: { $sum: '$size' }, count: { $sum: 1 } } },
  ]).toArray();
  return { bytes: agg[0]?.total || 0, count: agg[0]?.count || 0 };
}

async function getAiUsageToday(db, userId) {
  const start = new Date(); start.setHours(0,0,0,0);
  return db.collection('ai_generations').countDocuments({ userId, createdAt: { $gte: start } });
}

// ---------- JOURNAL (real, grounded user data only — no fabricated content) ----------
function journalWindow(cycle) {
  const now = new Date();
  let start;
  if (cycle === 'daily') { start = new Date(now); start.setHours(0, 0, 0, 0); }
  else if (cycle === 'weekly') { start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); }
  else if (cycle === 'yearly') { start = new Date(now.getFullYear(), 0, 1); }
  else { start = new Date(now.getFullYear(), now.getMonth(), 1); }
  return { start, end: now };
}

async function computeJournalData(db, userId, cycle) {
  const { start, end } = journalWindow(cycle);
  const items = await db.collection('media')
    .find({ userId, trashed: { $ne: true }, createdAt: { $gte: start } })
    .sort({ createdAt: -1 })
    .limit(500)
    .toArray();

  const photos = items.filter((m) => m.kind === 'photo').length;
  const videos = items.filter((m) => m.kind === 'video').length;
  const favorites = items.filter((m) => m.favorite || m.isFavorite).length;
  const locationSet = new Set();
  const peopleSet = new Set();
  const albumSet = new Set();
  const tagCounts = {};
  const descriptions = [];
  for (const m of items) {
    for (const loc of (m.aiAnalysis?.locations || [])) if (loc) locationSet.add(String(loc));
    for (const f of (m.aiAnalysis?.faces || [])) if (f) peopleSet.add(String(f));
    const album = m.aiAnalysis?.autoAlbum;
    if (album && album !== 'Unprocessed' && album !== 'General') albumSet.add(album);
    for (const t of (m.aiAnalysis?.tags || [])) {
      const k = String(t).toLowerCase();
      tagCounts[k] = (tagCounts[k] || 0) + 1;
    }
    if (m.aiAnalysis?.description) descriptions.push(m.aiAnalysis.description);
  }
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([tag, count]) => ({ tag, count }));
  const highlights = items
    .filter((m) => m.favorite || m.isFavorite || m.aiAnalysis?.description)
    .slice(0, 6)
    .map((m) => ({
      id: m.id,
      name: m.name,
      kind: m.kind,
      createdAt: m.createdAt,
      description: m.aiAnalysis?.description || null,
      isFavorite: !!(m.favorite || m.isFavorite),
    }));

  return {
    cycle,
    range: { start, end },
    stats: {
      memories: items.length,
      photos,
      videos,
      favorites,
      locations: locationSet.size,
      people: peopleSet.size,
      albums: albumSet.size,
    },
    topTags,
    locations: [...locationSet].slice(0, 10),
    albums: [...albumSet].slice(0, 10),
    descriptions: descriptions.slice(0, 20),
    highlights,
    hasAnalyzedMedia: descriptions.length > 0,
  };
}

async function issueVerification(db, user) {
  return { url: '', raw: '' };
}

async function handle(request, ctx) {
  let route = '';
  let method = '';
  try {
    const params = await (ctx?.params || {});
    const path = params.path || [];
    route = '/' + path.join('/');
    method = request.method;

    const db = await getDb();

    // ---------- AUTH ----------
    if (route === '/auth/config' && method === 'GET') {
      return json({ supabase: isSupabaseConfigured, serviceRole: hasSupabaseServiceRole, previewAllowed: isPreviewAuthAllowed() });
    }

    if (route === '/auth/signup' && method === 'POST') {
      if (!isSupabaseConfigured || !supabaseServer) return json({ error: 'Supabase authentication is not configured' }, 503);
      const { email, password, name } = await request.json().catch(() => ({}));
      const normalizedEmail = (email || '').toLowerCase().trim();
      if (!normalizedEmail || !password) return json({ error: 'Email & password required' }, 400);
      if (password.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);

      const { data, error } = await supabaseServer.auth.signUp({
        email: normalizedEmail,
        password,
        options: { data: { name: name || normalizedEmail.split('@')[0], plan: 'free', role: 'user' } },
      });

      if (error) {
        const status = /already|registered|exists/i.test(error.message || '') ? 409 : 400;
        return json({ error: status === 409 ? 'Email already in use' : error.message || 'Signup failed' }, status);
      }
      if (!data?.user) return json({ error: 'Signup failed' }, 400);

      const user = await syncSupabaseUserToAppUser(db, data.user);
      return json({
        token: data.session?.access_token || null,
        refreshToken: data.session?.refresh_token || null,
        expiresAt: data.session?.expires_at || null,
        user: clean(user),
        needsEmailConfirmation: !data.session,
      });
    }

    if (route === '/auth/login' && method === 'POST') {
      if (!isSupabaseConfigured || !supabaseServer) return json({ error: 'Supabase authentication is not configured' }, 503);
      const { email, password } = await request.json().catch(() => ({}));
      const normalizedEmail = (email || '').toLowerCase().trim();
      if (!normalizedEmail || !password) return json({ error: 'Email & password required' }, 400);

      const { data, error } = await supabaseServer.auth.signInWithPassword({ email: normalizedEmail, password });
      if (error || !data?.session?.access_token || !data?.user) return json({ error: 'Invalid credentials' }, 401);
      const user = await syncSupabaseUserToAppUser(db, data.user);
      return json({
        token: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at,
        user: clean(user),
      });
    }

    if (route === '/auth/logout' && method === 'POST') {
      return json({ ok: true });
    }

    if (route === '/auth/refresh' && method === 'POST') {
      if (!isSupabaseConfigured || !supabaseServer) return json({ error: 'Supabase authentication is not configured' }, 503);
      const { refreshToken } = await request.json().catch(() => ({}));
      if (!refreshToken) return json({ error: 'Refresh token required' }, 400);
      const { data, error } = await supabaseServer.auth.refreshSession({ refresh_token: refreshToken });
      if (error || !data?.session?.access_token || !data?.user) return json({ error: 'Session expired' }, 401);
      const user = await syncSupabaseUserToAppUser(db, data.user);
      return json({
        token: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at,
        user: clean(user),
      });
    }

    if (route === '/auth/me' && method === 'GET') {
      const user = await requireUser(request);
      if (!user) return json({ error: 'Unauthorized' }, 401);
      return json({ user });
    }

    if (route === '/auth/delete-account' && method === 'POST') {
      const user = await requireUser(request);
      if (!user) return json({ error: 'Unauthorized' }, 401);

      // 1. Delete all media and their files from storage
      const mediaDocs = await db.collection('media').find({ userId: user.id }).toArray();
      for (const doc of mediaDocs) {
        try {
          await storage.delete({ provider: doc.provider || 'local', storageKey: doc.storageKey });
        } catch (e) {
          console.error('[delete-account] failed to delete storage file', doc.storageKey, e?.message);
        }
      }
      await db.collection('media').deleteMany({ userId: user.id });

      // 2. Delete shared, favorites, albums and album members associated with this user
      await db.collection('shared_photos').deleteMany({ $or: [{ userId: user.id }, { ownerId: user.id }] });
      await db.collection('favorites').deleteMany({ $or: [{ userId: user.id }, { otherId: user.id }] });
      await db.collection('favorite_permissions').deleteMany({ $or: [{ ownerUserId: user.id }, { favoriteUserId: user.id }] });
      await db.collection('shared_albums').deleteMany({ ownerId: user.id });
      await db.collection('shared_album_members').deleteMany({ favoriteUserId: user.id });
      await db.collection('shared_memories').deleteMany({ ownerId: user.id });
      await db.collection('exports').deleteMany({ userId: user.id });
      await db.collection('email_prefs').deleteMany({ userId: user.id });
      await db.collection('notifications').deleteMany({ userId: user.id });
      await db.collection('billing_status').deleteMany({ userId: user.id });

      // 3. Delete user record and Supabase auth user when possible
      await db.collection('users').deleteOne({ id: user.id });
      if (supabaseAdmin && user.supabaseUserId) {
        try { await supabaseAdmin.auth.admin.deleteUser(user.supabaseUserId); } catch (e) { console.error('[delete-account] Supabase user delete failed', e?.message); }
      }

      return json({ ok: true, message: 'Account and all data deleted successfully.' });
    }

    if (route === '/auth/forgot' && method === 'POST') {
      const { email } = await request.json().catch(() => ({}));
      const result = { ok: true, message: 'If an account exists for this email, a password reset link has been sent.' };
      if (!email) return json(result);
      if (!isSupabaseConfigured || !supabaseServer) return json({ error: 'Supabase authentication is not configured' }, 503);
      const base = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || '';
      const redirectTo = `${base}/reset-password`;
      const { error } = await supabaseServer.auth.resetPasswordForEmail(email.toLowerCase().trim(), { redirectTo });
      if (error) console.error('[forgot] Supabase reset email failed:', error?.message);
      return json(result);
    }

    if (route === '/auth/reset/verify' && method === 'GET') {
      const url = new URL(request.url);
      const tokenHash = url.searchParams.get('token_hash') || url.searchParams.get('token') || '';
      if (!tokenHash) return json({ ok: false, reason: 'missing' }, 400);
      return json({ ok: true });
    }

    if (route === '/auth/reset' && method === 'POST') {
      const { token, token_hash: tokenHashFromBody, accessToken, refreshToken, password } = await request.json().catch(() => ({}));
      const tokenHash = tokenHashFromBody || token;
      if (!password) return json({ error: 'Password required' }, 400);
      if (password.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);
      if (!isSupabaseConfigured || !supabaseServer) return json({ error: 'Supabase authentication is not configured' }, 503);

      let client = supabaseServer;
      if (accessToken && refreshToken) {
        const sessionResult = await supabaseServer.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (sessionResult.error) return json({ error: 'Invalid reset session' }, 400);
      } else if (tokenHash) {
        const verify = await supabaseServer.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
        if (verify.error) return json({ error: 'Invalid or expired reset link' }, 400);
      } else {
        return json({ error: 'Reset token required' }, 400);
      }

      const { error } = await client.auth.updateUser({ password });
      if (error) return json({ error: error.message || 'Could not reset password' }, 400);
      return json({ ok: true });
    }

    // ---------- EMAIL VERIFICATION ----------
    if (route === '/auth/verify/send' && method === 'POST') {
      const user = await requireUser(request);
      if (!user) return json({ error: 'Unauthorized' }, 401);
      if (user.emailVerified) return json({ ok: true, alreadyVerified: true });
      const v = await issueVerification(db, user);
      try {
        if (supabaseServer) {
          const base = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || '';
          await supabaseServer.auth.resend({ type: 'signup', email: user.email, options: { emailRedirectTo: `${base}/login` } });
        }
      } catch (e) { console.error('[verify/send] Supabase resend failed', e?.message); }
      const resp = { ok: true };
      if (!isProduction()) resp._devVerifyUrl = v.url;
      return json(resp);
    }

    if (route === '/auth/verify' && method === 'GET') {
      const url = new URL(request.url);
      const tokenHash = url.searchParams.get('token_hash') || url.searchParams.get('token') || '';
      if (!tokenHash) return json({ ok: false, reason: 'missing' }, 400);
      if (!supabaseServer) return json({ ok: false, reason: 'not_configured' }, 503);
      let verify = await supabaseServer.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
      if (verify.error) verify = await supabaseServer.auth.verifyOtp({ token_hash: tokenHash, type: 'signup' });
      if (verify.error || !verify.data?.user) return json({ ok: false, reason: 'invalid' }, 400);
      const synced = await syncSupabaseUserToAppUser(db, verify.data.user);
      await db.collection('users').updateOne({ id: synced.id }, { $set: { emailVerified: true, emailVerifiedAt: new Date() } });
      return json({ ok: true });
    }

    // ---------- PLANS ----------
    if (route === '/plans' && method === 'GET') {
      return json({ plans: Object.values(PLANS) });
    }

    // ---------- STORAGE USAGE ----------
    if (route === '/storage/usage' && method === 'GET') {
      const user = await requireUser(request);
      if (!user) return json({ error: 'Unauthorized' }, 401);
      const plan = effectivePlan(user, request);
      const usage = applyStorageSimulation(await getStorageUsage(db, user.id), request);
      const devEntitlement = entitlementForUser(user, request);
      const aiUsed = await getAiUsageToday(db, user.id);
      return json({
        usage,
        plan: { id: plan.id, name: plan.name, storageBytes: plan.storageBytes, aiPerDay: plan.aiPerDay },
        rawPlan: user.plan || 'free',
        role: user.role || 'user',
        effectivePlan: plan.id,
        isSuper: plan.id === 'super_user',
        developerProfile: devEntitlement.developerProfile || null,
        storageSimulated: !!usage.simulated,
        aiUsedToday: aiUsed,


      });
    }

    // ---------- MEDIA: UPLOAD ----------
    if (route === '/media/upload' && method === 'POST') {
      const user = await requireUser(request);
      if (!user) return json({ error: 'Unauthorized' }, 401);
      const plan = effectivePlan(user, request);
      const usage = await getStorageUsage(db, user.id);
      const remaining = plan.id === 'super_user' ? Number.MAX_SAFE_INTEGER : (plan.storageBytes - usage.bytes);
      const singleUploadLimit = Math.min(storage.config.maxUploadBytes || Number.MAX_SAFE_INTEGER, plan.maxUploadBytes || Number.MAX_SAFE_INTEGER);


      const formData = await request.formData();
      const files = formData.getAll('files');
      if (!files.length) return json({ error: 'No files' }, 400);

      const saved = [];
      const skipped = [];
      let runningRemaining = remaining;

      for (const file of files) {
        try {
          const buffer = Buffer.from(await file.arrayBuffer());
          const size = buffer.length;
          const hash = crypto.createHash('sha256').update(buffer).digest('hex');

          // duplicate check
          const dup = await db.collection('media').findOne({ userId: user.id, hash });
          if (dup) { skipped.push({ name: file.name, reason: 'duplicate', message: 'This file is already safely stored.', retryable: false, timestamp: new Date().toISOString() }); continue; }

          if (plan.id !== 'super_user' && size > runningRemaining) {
            skipped.push({ name: file.name, reason: 'storage_full', message: 'Storage quota exceeded. Upgrade your plan or free up space.', retryable: false, timestamp: new Date().toISOString() });
            continue;
          }

          // hard upper bound per file (single-shot upload). Larger files need multipart.
          if (size > singleUploadLimit) {
            skipped.push({ name: file.name, reason: 'too_large', message: `File exceeds the single-upload limit (${Math.round(singleUploadLimit / 1024 / 1024)} MB).`, retryable: false, timestamp: new Date().toISOString() });
            continue;
          }

          const id = uuidv4();
          const ext = (file.name?.split('.').pop() || 'bin').toLowerCase();
          const isVideo = (file.type || '').startsWith('video/') || ['mp4','mov','webm','avi','mkv'].includes(ext);
          let stored;
          try {
            stored = await storage.save({ userId: user.id, fileId: id, buffer, ext, name: file.name, mime: file.type });
          } catch (e) {
            const storageFailure = safeStorageError(e);
            console.error('[upload] storage error:', {
              reason: storageFailure.reason,
              component: storageFailure.component,
              code: storageFailure.code,
              message: storageFailure.technical,
              provider: storage.active(),
              fileName: file.name,
              size,
              remaining: runningRemaining,
            });
            skipped.push({
              name: file.name,
              reason: storageFailure.reason,
              message: storageFailure.message,
              retryable: storageFailure.retryable,
              component: storageFailure.component,
              code: storageFailure.code,
              timestamp: new Date().toISOString(),
            });
            continue;
          }
          let aiAnalysis = null;
          try {
            if (isVideo) {
              aiAnalysis = await analyzeVideo({ buffer, name: file.name, mimeType: file.type || '' });
            } else {
              aiAnalysis = await analyzeImage({ buffer, mimeType: file.type || '' });
            }
          } catch (err) {
            console.error('[upload] AI analysis error:', err?.message);
          }
          const doc = {
            id, userId: user.id, name: file.name, size, hash,
            mime: file.type || '', kind: isVideo ? 'video' : 'photo',
            storageKey: stored.storageKey, provider: stored.provider,
            favorite: false, trashed: false,
            aiAnalysis,
            createdAt: new Date(),
          };
          await db.collection('media').insertOne(doc);
          saved.push(clean(doc));
          runningRemaining -= size;
        } catch (e) {
          skipped.push({ name: file?.name || 'unknown', reason: 'error' });
        }
      }

      return json({ saved, skipped, savedCount: saved.length, skippedCount: skipped.length });
    }

    // ---------- MEDIA: TEXT QUICK CAPTURE ----------
    if (route === '/media/text' && method === 'POST') {
      const user = await requireUser(request);
      if (!user) return json({ error: 'Unauthorized' }, 401);
      const { text, title, tags = [], category = 'Personal' } = await request.json().catch(() => ({}));
      if (!text) return json({ error: 'Text content is required' }, 400);

      const id = uuidv4();
      const doc = {
        id,
        userId: user.id,
        name: title || 'Quick Captures',
        size: text.length,
        hash: crypto.createHash('sha256').update(text).digest('hex'),
        mime: 'text/plain',
        kind: 'text',
        storageKey: '',
        provider: 'local',
        favorite: false,
        trashed: false,
        aiAnalysis: {
          caption: text,
          tags: tags.length ? tags : ['quick-capture', category.toLowerCase()],
          autoAlbum: category,
          description: text,
          faces: []
        },
        createdAt: new Date(),
      };
      await db.collection('media').insertOne(doc);
      return json({ ok: true, item: clean(doc) });
    }

    // ---------- MEDIA: LIST ----------
    if (route === '/media' && method === 'GET') {
      const user = await requireUser(request);
      if (!user) return json({ error: 'Unauthorized' }, 401);
      const url = new URL(request.url);
      const filter = url.searchParams.get('filter') || 'all'; // all|photo|video|favorite|trash
      const q = url.searchParams.get('q') || '';
      const query = { userId: user.id };
      if (filter === 'trash') query.trashed = true; else query.trashed = { $ne: true };
      if (filter === 'photo') query.kind = 'photo';
      if (filter === 'video') query.kind = 'video';
      if (filter === 'favorite') query.favorite = true;
      if (q) {
        query.$or = [
          { name: { $regex: q, $options: 'i' } },
          { 'aiAnalysis.description': { $regex: q, $options: 'i' } },
          { 'aiAnalysis.tags': { $regex: q, $options: 'i' } },
          { 'aiAnalysis.faces': { $regex: q, $options: 'i' } },
          { 'aiAnalysis.locations': { $regex: q, $options: 'i' } },
          { 'aiAnalysis.emotions': { $regex: q, $options: 'i' } },
          { 'aiAnalysis.autoAlbum': { $regex: q, $options: 'i' } },
          { 'aiAnalysis.textInside': { $regex: q, $options: 'i' } }
        ];
      }
      const items = await db.collection('media').find(query).sort({ createdAt: -1 }).limit(500).toArray();
      return json({ items: items.map(clean) });
    }

    // ---------- MEDIA: FILE STREAM ----------
    const fileMatch = route.match(/^\/media\/([^/]+)\/file$/);
    if (fileMatch && method === 'GET') {
      const id = fileMatch[1];
      const url = new URL(request.url);
      const token = url.searchParams.get('t');
      const dl = url.searchParams.get('dl') === '1';
      // accept token via query for img tags
      let user = await requireUser(request);
      if (!user && token) {
        const fakeReq = { headers: { get: (k) => k.toLowerCase() === 'authorization' ? `Bearer ${token}` : null } };
        user = await getUserFromRequest(fakeReq);
      }
      if (!user) return json({ error: 'Unauthorized' }, 401);
      const doc = await db.collection('media').findOne({ id, userId: user.id });
      if (!doc) return json({ error: 'Not found' }, 404);
      const provider = doc.provider || 'local';
      if (provider === 's3') {
        // Redirect to a short-lived presigned URL.
        try {
          const signed = await storage.getReadUrl({
            provider: 's3', storageKey: doc.storageKey, expiresSec: 600,
            filename: dl ? doc.name : null, contentType: doc.mime || null,
          });
          return cors(NextResponse.redirect(signed, 302));
        } catch (e) {
          return json({ error: 'Storage unavailable: ' + (e?.message || 'unknown') }, 502);
        }
      }
      // local: stream through API
      try {
        const buf = await storage.read({ provider: 'local', storageKey: doc.storageKey });
        const headers = {
          'Content-Type': doc.mime || 'application/octet-stream',
          'Cache-Control': 'private, max-age=3600',
        };
        if (dl) headers['Content-Disposition'] = `attachment; filename="${doc.name?.replace(/"/g, '') || 'file'}"`;
        return cors(new NextResponse(buf, { status: 200, headers }));
      } catch (e) {
        return json({ error: 'File not found on disk' }, 404);
      }
    }

    // ---------- MEDIA: ACTIONS ----------
    const actMatch = route.match(/^\/media\/([^/]+)\/(favorite|trash|restore|delete)$/);
    if (actMatch && method === 'POST') {
      const user = await requireUser(request);
      if (!user) return json({ error: 'Unauthorized' }, 401);
      const id = actMatch[1]; const action = actMatch[2];
      const doc = await db.collection('media').findOne({ id, userId: user.id });
      if (!doc) return json({ error: 'Not found' }, 404);
      if (action === 'favorite') {
        await db.collection('media').updateOne({ id }, { $set: { favorite: !doc.favorite } });
      } else if (action === 'trash') {
        await db.collection('media').updateOne({ id }, { $set: { trashed: true, trashedAt: new Date() } });
      } else if (action === 'restore') {
        await db.collection('media').updateOne({ id }, { $set: { trashed: false }, $unset: { trashedAt: '' } });
      } else if (action === 'delete') {
        await storage.delete({ provider: doc.provider || 'local', storageKey: doc.storageKey });
        await db.collection('media').deleteOne({ id });
      }
      return json({ ok: true });
    }

    // bulk actions
    if (route === '/media/bulk' && method === 'POST') {
      const user = await requireUser(request);
      if (!user) return json({ error: 'Unauthorized' }, 401);
      const { ids = [], action } = await request.json();
      if (!ids.length) return json({ error: 'No ids' }, 400);
      const filter = { id: { $in: ids }, userId: user.id };
      if (action === 'trash') await db.collection('media').updateMany(filter, { $set: { trashed: true, trashedAt: new Date() } });
      else if (action === 'restore') await db.collection('media').updateMany(filter, { $set: { trashed: false } });
      else if (action === 'favorite') await db.collection('media').updateMany(filter, { $set: { favorite: true } });
      else if (action === 'unfavorite') await db.collection('media').updateMany(filter, { $set: { favorite: false } });
      else if (action === 'delete') {
        const docs = await db.collection('media').find(filter).toArray();
        for (const d of docs) await storage.delete({ provider: d.provider || 'local', storageKey: d.storageKey });
        await db.collection('media').deleteMany(filter);
      }
      return json({ ok: true });
    }

    // ---------- MEMORIES ----------
    if (route === '/memories' && method === 'GET') {
      const user = await requireUser(request);
      if (!user) return json({ error: 'Unauthorized' }, 401);
      const all = await db.collection('media').find({ userId: user.id, trashed: { $ne: true } }).sort({ createdAt: -1 }).toArray();
      // group by month-year
      const groups = {};
      const onThisDay = [];
      const today = new Date();
      for (const m of all) {
        const d = new Date(m.createdAt);
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        if (!groups[key]) groups[key] = { key, label: d.toLocaleString('en-US',{month:'long',year:'numeric'}), items: [] };
        groups[key].items.push(clean(m));
        if (d.getMonth() === today.getMonth() && d.getDate() === today.getDate() && d.getFullYear() !== today.getFullYear()) {
          onThisDay.push(clean(m));
        }
      }
      return json({ groups: Object.values(groups), onThisDay });
    }

    // ---------- JOURNAL (grounded in the authenticated user's real media) ----------
    if (route === '/journal/summary' && method === 'GET') {
      const user = await requireUser(request);
      if (!user) return json({ error: 'Unauthorized' }, 401);
      const cycle = ['daily', 'weekly', 'monthly', 'yearly'].includes(new URL(request.url).searchParams.get('cycle'))
        ? new URL(request.url).searchParams.get('cycle')
        : 'monthly';
      const data = await computeJournalData(db, user.id, cycle);
      // Only expose fields the UI needs. All values are computed from real media.
      return json({
        cycle: data.cycle,
        range: data.range,
        stats: data.stats,
        topTags: data.topTags,
        highlights: data.highlights,
        hasAnalyzedMedia: data.hasAnalyzedMedia,
      });
    }

    if (route === '/journal/narrative' && method === 'POST') {
      const user = await requireUser(request);
      if (!user) return json({ error: { code: 'unauthenticated', message: 'Please sign in to use SnapNext AI.' } }, 401);
      const body = await request.json().catch(() => ({}));
      const cycle = ['daily', 'weekly', 'monthly', 'yearly'].includes(body.cycle) ? body.cycle : 'monthly';
      const data = await computeJournalData(db, user.id, cycle);
      if (data.stats.memories === 0) {
        return json({ error: { code: 'no_data', message: 'No memories saved in this period yet. Back up photos or videos first.' } }, 400);
      }
      // Grounded prompt: the model may only use these verified facts.
      const facts = {
        period: cycle,
        memories: data.stats.memories,
        photos: data.stats.photos,
        videos: data.stats.videos,
        favorites: data.stats.favorites,
        topTags: data.topTags,
        locations: data.locations,
        albums: data.albums,
        mediaDescriptions: data.descriptions,
      };
      const prompt = `Write a short, warm, first-person journal narrative (3-5 sentences) for the user's ${cycle} journal. It must be STRICTLY grounded in the verified facts below about media the user actually saved. Absolute rules: do not invent names, people, relationships, places, trips, events, dates, counts, or emotions that are not directly supported by the facts. If the facts are sparse, keep the narrative brief and factual. Do not address the user by name.\nVERIFIED FACTS: ${JSON.stringify(facts)}`;
      const result = await runAiTask({ db, user, feature: 'memorySummary', input: { cycle }, prompt, request });
      if (!result.ok) return aiJson(result);
      return json({ narrative: readAiResult(result, 'summary'), meta: result.meta });
    }

    // ---------- AI ----------
    if (route === '/ai/status' && method === 'GET') {
      const user = await requireUser(request); if (!user) return json({ error: { code: 'unauthenticated', message: 'Please sign in to use SnapNext AI.' } }, 401);
      const feature = new URL(request.url).searchParams.get('feature') || 'chat';
      const entitlement = getAiEntitlement(user, feature, 1, request);
      if (!entitlement.ok) return json({ error: entitlement.error }, entitlement.status || 400);
      return json({
        plan: entitlement.plan,
        feature,
        creditsRequired: entitlement.credits,
        monthlyCredits: entitlement.limits.monthlyCredits,
        dailyCredits: entitlement.limits.dailyCredits,
        superUser: entitlement.plan === 'super_user',
      });
    }

    if (route === '/ai/analytics' && method === 'GET') {
      const user = await requireUser(request); if (!user) return json({ error: { code: 'unauthenticated', message: 'Please sign in to view AI analytics.' } }, 401);
      const result = await getAiUsageSummary({ db, user, request });
      return aiJson(result);
    }

    if (route === '/ai/history' && method === 'GET') {
      const user = await requireUser(request); if (!user) return json({ error: { code: 'unauthenticated', message: 'Please sign in to view AI history.' } }, 401);
      const items = await db.collection('ai_history').find({ userId: user.id, deleted: { $ne: true } }).sort({ createdAt: -1 }).limit(100).toArray();
      return json({ items: items.map(clean) });
    }

    if (route === '/ai/caption' && method === 'POST') {
      const user = await requireUser(request); if (!user) return json({ error: { code: 'unauthenticated', message: 'Please sign in to use SnapNext AI.' } }, 401);
      const body = await request.json().catch(() => ({}));
      let media = null;
      if (body.mediaId) {
        const doc = await db.collection('media').findOne({ id: body.mediaId, userId: user.id });
        if (doc?.kind === 'photo') {
          try { const buf = await storage.read({ provider: doc.provider || 'local', storageKey: doc.storageKey }); media = { imageBase64: buf.toString('base64'), mimeType: doc.mime, size: doc.size }; } catch {}
        }
      }
      const result = await runAiTask({ db, user, feature: 'caption', input: body, prompt: body.topic || body.text || 'Caption this memory', media, request });
      if (!result.ok) return aiJson(result);
      return json({ caption: readAiResult(result, 'caption'), meta: result.meta });
    }

    if (route === '/ai/hashtags' && method === 'POST') {
      const user = await requireUser(request); if (!user) return json({ error: { code: 'unauthenticated', message: 'Please sign in to use SnapNext AI.' } }, 401);
      const body = await request.json().catch(() => ({}));
      const result = await runAiTask({ db, user, feature: 'hashtags', input: body, prompt: body.text || 'Generate hashtags', request });
      if (!result.ok) return aiJson(result);
      return json({ hashtags: readAiResult(result, 'hashtags'), meta: result.meta });
    }

    if (route === '/ai/emojis' && method === 'POST') {
      const user = await requireUser(request); if (!user) return json({ error: { code: 'unauthenticated', message: 'Please sign in to use SnapNext AI.' } }, 401);
      const body = await request.json().catch(() => ({}));
      const result = await runAiTask({ db, user, feature: 'emojis', input: body, prompt: body.text || 'Suggest emojis', request });
      if (!result.ok) return aiJson(result);
      return json({ emojis: readAiResult(result, 'emojis'), meta: result.meta });
    }

    if (route === '/ai/post-ideas' && method === 'POST') {
      const user = await requireUser(request); if (!user) return json({ error: { code: 'unauthenticated', message: 'Please sign in to use SnapNext AI.' } }, 401);
      const body = await request.json().catch(() => ({}));
      const result = await runAiTask({ db, user, feature: 'postIdeas', input: body, prompt: body.topic || body.text || 'Create post ideas', request });
      if (!result.ok) return aiJson(result);
      return json({ ideas: readAiResult(result, 'ideas'), meta: result.meta });
    }

    if (route === '/ai/memory-summary' && method === 'POST') {
      const user = await requireUser(request); if (!user) return json({ error: { code: 'unauthenticated', message: 'Please sign in to use SnapNext AI.' } }, 401);
      const body = await request.json().catch(() => ({}));
      const result = await runAiTask({ db, user, feature: 'memorySummary', input: body, prompt: `${body.dateLabel || ''} ${(body.titles || []).join(', ')}`.trim() || 'Summarize memories', request });
      if (!result.ok) return aiJson(result);
      return json({ summary: readAiResult(result, 'summary'), meta: result.meta });
    }

    if (route === '/ai/story' && method === 'POST') {
      const user = await requireUser(request); if (!user) return json({ error: { code: 'unauthenticated', message: 'Please sign in to use SnapNext AI.' } }, 401);
      const body = await request.json().catch(() => ({}));
      const result = await runAiTask({ db, user, feature: 'story', input: body, prompt: body.theme || 'Create a memory story', request });
      if (!result.ok) return aiJson(result);
      return json({ cards: readAiResult(result, 'cards'), meta: result.meta });
    }

    // ---------- CORE AI BRAIN & MEMORIES TIMELINE ----------
    if (route === '/memories/timeline' && method === 'GET') {
      const user = await requireUser(request);
      if (!user) return json({ error: 'Unauthorized' }, 401);
      
      const all = await db.collection('media').find({ userId: user.id, trashed: { $ne: true } }).sort({ createdAt: -1 }).toArray();
      const today = new Date();
      
      const onThisDay = [];
      const familyJourney = [];
      const travelHistory = [];
      const childGrowth = [];
      const relationship = [];
      const petTimeline = [];

      for (const m of all) {
        const d = new Date(m.createdAt);
        const tags = (m.aiAnalysis?.tags || []).map(t => t.toLowerCase());
        const faces = (m.aiAnalysis?.faces || []).map(f => f.toLowerCase());
        const autoAlbum = (m.aiAnalysis?.autoAlbum || '');

        // This Day Last Year
        if (d.getMonth() === today.getMonth() && d.getDate() === today.getDate() && d.getFullYear() !== today.getFullYear()) {
          onThisDay.push(clean(m));
        }
        
        // Family Journey
        if (autoAlbum === 'Family' || faces.some(f => ['mom', 'dad', 'family', 'parent', 'daughter', 'son', 'brother', 'sister'].includes(f))) {
          familyJourney.push(clean(m));
        }

        // Travel History
        if (autoAlbum === 'Travel' || tags.some(t => ['travel', 'trip', 'vacation', 'beach', 'hotel', 'flight', 'mountain', 'lake', 'sea'].includes(t)) || m.aiAnalysis?.locations?.length > 0) {
          travelHistory.push(clean(m));
        }

        // Child Growth
        if (autoAlbum === 'Kids' || tags.some(t => ['child', 'kid', 'baby', 'toddler', 'growth'].includes(t))) {
          childGrowth.push(clean(m));
        }

        // Relationship Timeline
        if (autoAlbum === 'Wedding' || faces.some(f => ['couple', 'wife', 'husband', 'partner', 'marriage', 'wedding'].includes(f))) {
          relationship.push(clean(m));
        }

        // Pet Timeline
        if (autoAlbum === 'Pets' || tags.some(t => ['pet', 'dog', 'cat', 'animal', 'puppy', 'kitten'].includes(t))) {
          petTimeline.push(clean(m));
        }
      }

      // TRUTHFULNESS: recaps are deterministic statements computed from the
      // user's real media only. No invented themes, emotions, or claims.
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const lastMonthItems = all.filter((m) => new Date(m.createdAt) >= thirtyDaysAgo);
      const monthTagCounts = {};
      for (const m of lastMonthItems) {
        for (const t of (m.aiAnalysis?.tags || [])) {
          const k = String(t).toLowerCase();
          monthTagCounts[k] = (monthTagCounts[k] || 0) + 1;
        }
      }
      const topMonthTags = Object.entries(monthTagCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);
      const monthlyRecap = lastMonthItems.length > 0
        ? `You saved ${lastMonthItems.length} ${lastMonthItems.length === 1 ? 'memory' : 'memories'} in the last 30 days${topMonthTags.length ? ` — common themes: ${topMonthTags.join(', ')}` : ''}.`
        : 'No new memories in the last 30 days yet. Back up recent photos or videos to keep your timeline growing.';

      const currentYear = today.getFullYear();
      const yearItems = all.filter((m) => new Date(m.createdAt).getFullYear() === currentYear);
      const yearPhotos = yearItems.filter((m) => m.kind === 'photo').length;
      const yearVideos = yearItems.filter((m) => m.kind === 'video').length;
      const yearlyRecap = yearItems.length > 0
        ? `So far in ${currentYear} you have saved ${yearItems.length} ${yearItems.length === 1 ? 'memory' : 'memories'} (${yearPhotos} ${yearPhotos === 1 ? 'photo' : 'photos'}, ${yearVideos} ${yearVideos === 1 ? 'video' : 'videos'}).`
        : `No memories saved in ${currentYear} yet. Upload photos or videos to start this year's timeline.`;

      return json({
        onThisDay,
        familyJourney,
        travelHistory,
        childGrowth,
        relationship,
        petTimeline,
        monthlyRecap,
        yearlyRecap
      });
    }

    // ---------- FAVORITES AI ----------
    if (route === '/favorites/ai' && method === 'GET') {
      const user = await requireUser(request);
      if (!user) return json({ error: 'Unauthorized' }, 401);

      const all = await db.collection('media').find({ userId: user.id, trashed: { $ne: true } }).toArray();
      
      const faceCounts = {};
      for (const m of all) {
        if (m.aiAnalysis?.faces) {
          for (const face of m.aiAnalysis.faces) {
            const canonical = face.trim();
            if (canonical) {
              faceCounts[canonical] = (faceCounts[canonical] || 0) + 1;
            }
          }
        }
      }

      const favoritePeople = Object.entries(faceCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      const suggestions = favoritePeople.length > 0 
        ? [`"${favoritePeople[0].name}" appears in ${favoritePeople[0].count} of your analyzed memories. Create a shared timeline?`, `Build an album featuring ${favoritePeople[0].name}.`]
        : ["Upload photos so SnapNext can group the people who appear in your analyzed memories."];

      // TRUTHFULNESS: factual statement based on real analysis counts only.
      const relationshipHighlights = favoritePeople.length > 0
        ? `${favoritePeople.slice(0, 3).map(p => `"${p.name}"`).join(', ')} ${favoritePeople.length === 1 ? 'appears' : 'appear'} most often in your analyzed memories.`
        : null;

      return json({
        favoritePeople,
        suggestions,
        relationshipHighlights
      });
    }

    // ---------- SNAPNEXT AI CHAT ASSISTANT & VOICE ASSISTANT ----------
    if (route === '/ai/chat' && method === 'POST') {
      const user = await requireUser(request); if (!user) return json({ error: { code: 'unauthenticated', message: 'Please sign in to use SnapNext AI.' } }, 401);
      
      const { query, voiceResponse = false } = await request.json();
      if (!query) return json({ error: 'Query is required' }, 400);

      const mediaList = await db.collection('media').find({ userId: user.id, trashed: { $ne: true } }).sort({ createdAt: -1 }).limit(100).toArray();
      const libraryContext = mediaList.map(m => ({
        id: m.id,
        name: m.name,
        kind: m.kind,
        tags: m.aiAnalysis?.tags || [],
        faces: m.aiAnalysis?.faces || [],
        locations: m.aiAnalysis?.locations || [],
        autoAlbum: m.aiAnalysis?.autoAlbum || '',
        description: m.aiAnalysis?.description || ''
      }));

      const result = await runAiTask({ db, user, feature: 'chat', input: { query }, prompt: `User: ${query}\nLibrary context JSON: ${JSON.stringify(libraryContext).slice(0, 8000)}`, request });
      if (!result.ok) return aiJson(result);
      const replyText = readAiResult(result, 'reply');

      let audioBase64 = null;
      if (voiceResponse && process.env.GEMINI_API_KEY) {
        try {
          const { GoogleGenAI, Modality } = await import('@google/genai');
          const voiceAi = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
          const ttsResponse = await voiceAi.models.generateContent({
            model: "gemini-3.1-flash-tts-preview",
            contents: [{ parts: [{ text: replyText.slice(0, 300) }] }],
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
              },
            },
          });
          audioBase64 = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
        } catch (err) {
          console.error('[voice-tts] Failed to generate speech:', err?.message);
        }
      }

      return json({ reply: replyText, audio: audioBase64 });
    }

    // ---------- AUDIO TRANSCRIPTION ----------
    if (route === '/ai/audio-transcribe' && method === 'POST') {
      const user = await requireUser(request); if (!user) return json({ error: { code: 'unauthenticated', message: 'Please sign in to use SnapNext AI.' } }, 401);
      const q = await preflightAiRequest({ db, user, feature: 'audioTranscribe', prompt: 'Transcribe audio', request }); if (!q.ok) return aiJson(q);

      const { mediaId } = await request.json();
      if (!mediaId) return json({ error: 'mediaId is required' }, 400);

      const doc = await db.collection('media').findOne({ id: mediaId, userId: user.id });
      if (!doc) return json({ error: 'Media not found' }, 404);

      // TRUTHFULNESS: never return a canned fake transcript. If transcription
      // fails or is unavailable, return an honest structured error instead.
      try {
        const buf = await storage.read({ provider: doc.provider || 'local', storageKey: doc.storageKey });
        const text = await transcribeAudio({ buffer: buf, mimeType: doc.mime });
        await db.collection('media').updateOne({ id: mediaId }, { $set: { 'aiAnalysis.transcript': text } });
        return json({ transcript: text, meta: { creditsUsed: q.credits, plan: q.plan, requestId: q.requestId } });
      } catch (err) {
        console.error('[transcription] error:', err?.message);
        const code = err?.code === 'ai_service_unavailable' ? 'ai_service_unavailable' : 'transcription_failed';
        const status = code === 'ai_service_unavailable' ? 503 : 502;
        return json({
          error: {
            code,
            message: code === 'ai_service_unavailable'
              ? 'Audio transcription is not available yet. The AI service is not configured.'
              : 'We could not transcribe this audio right now. Please try again.',
            retryable: code !== 'ai_service_unavailable',
          },
        }, status);
      }
    }

    // ---------- AI REEL CREATOR ----------
    if (route === '/ai/generate-reel' && method === 'POST') {
      const user = await requireUser(request); if (!user) return json({ error: { code: 'unauthenticated', message: 'Please sign in to use SnapNext AI.' } }, 401);

      const { theme, mediaIds = [] } = await request.json();
      
      const result = await runAiTask({ db, user, feature: 'videoScript', input: { topic: theme || 'Memory reel', mediaIds }, prompt: theme || 'Create a short video script', request });
      if (!result.ok) return aiJson(result);
      return json({
        title: theme ? `${theme} Reel` : "My Lifetime Highlights Reel",
        script: readAiResult(result, 'script'),
        meta: result.meta,
      });
    }

    // ---------- IMAGE TO VIDEO (PREMIUM VEO LITE) ----------
    if (route === '/ai/image-to-video' && method === 'POST') {
      const user = await requireUser(request); if (!user) return json({ error: { code: 'unauthenticated', message: 'Please sign in to use SnapNext AI.' } }, 401);

      const { mediaId } = await request.json();
      if (!mediaId) return json({ error: 'mediaId is required' }, 400);

      const doc = await db.collection('media').findOne({ id: mediaId, userId: user.id });
      if (!doc) return json({ error: 'Media not found' }, 404);

      const result = await runAiTask({ db, user, feature: 'videoScript', input: { topic: doc.name }, prompt: `Create an image-to-video motion plan for ${doc.name}`, request });
      if (!result.ok) return aiJson(result);
      const motionEffect = {
        zoom: 'Ken Burns pan-and-zoom in',
        framerate: '60fps',
        vibe: 'Warm light leaks & vintage emotional film overlays',
        duration: '6 seconds',
        prompt: readAiResult(result, 'script'),
        cinematicMotionUrl: `/api/media/${mediaId}/file`
      };

      return json({
        success: true,
        mediaId,
        motionEffect,
        meta: result.meta,
        message: "Premium cinematic motion prompt generated."
      });
    }

    // ---------- BILLING ----------
    if (route === '/billing/checkout' && method === 'POST') {
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      const { planId, interval = 'monthly' } = await request.json();
      if (!PLANS[planId] || planId === 'free' || planId === 'super_user') return json({ error: 'Invalid plan' }, 400);
      try {
        const result = await billing.createCheckoutSession({ user, planId, interval });
        return json({ ok: true, ...result, provider: billing.active });
      } catch (e) {
        return json({ error: e?.message || 'Checkout failed', provider: billing.active }, 400);
      }
    }
    if (route === '/billing/portal' && method === 'POST') {
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      try {
        const result = await billing.createCustomerPortalSession({ user });
        return json({ ok: true, ...result, provider: billing.active });
      } catch (e) {
        return json({ error: e?.message || 'Portal failed', code: e?.code || null, provider: billing.active }, 400);
      }
    }
    if (route === '/billing/status' && method === 'GET') {
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      const status = await billing.getBillingStatus({ user });
      const plan = effectivePlan(user, request);
      return json({ ...status, plan: plan.id, planDetails: plan, isSuper: plan.id === 'super_user' });
    }

    if (route === '/webhooks/stripe' && method === 'POST') {
      const rawBody = await request.text();
      const signature = request.headers.get('stripe-signature') || '';
      if (!process.env.STRIPE_WEBHOOK_SECRET) {
        // We refuse to process unverified webhooks in any mode.
        return json({ error: 'Webhook secret not configured' }, 503);
      }
      try {
        const result = await billing.handleStripeWebhook({ rawBody, signature });
        return json({ received: true, ...result });
      } catch (e) {
        console.error('[stripe webhook] verify/process error:', e?.message);
        return json({ error: e?.message || 'webhook_error' }, 400);
      }
    }

    if (route === '/admin/billing/health' && method === 'GET') {
      const user = await requireUser(request);
      if (!user || !isSuperUser(user)) return json({ error: 'Forbidden' }, 403);
      const health = await billing.health();
      const counts = await db.collection('subscriptions').aggregate([
        { $group: { _id: { plan: '$plan', status: '$status' }, count: { $sum: 1 } } },
      ]).toArray();
      const recent = await db.collection('billing_events').find({}).sort({ createdAt: -1 }).limit(50).toArray();
      return json({ ...health, subscriptionCounts: counts, recentEvents: recent.map(({ _id, ...e }) => e) });
    }

    // ---------- ADMIN ----------
    if (route === '/admin/users' && method === 'GET') {
      const user = await requireUser(request); if (!user || !isSuperUser(user)) return json({ error: 'Forbidden' }, 403);
      const users = await db.collection('users').find({}).limit(500).toArray();
      return json({ users: users.map(clean) });
    }
    if (route === '/admin/grant-super' && method === 'POST') {
      const user = await requireUser(request); if (!user || !isSuperUser(user)) return json({ error: 'Forbidden' }, 403);
      const { userId } = await request.json();
      await db.collection('users').updateOne({ id: userId }, { $set: { plan: 'super_user', role: 'admin' } });
      return json({ ok: true });
    }
    if (route === '/admin/seed-super' && method === 'POST') {
      // Bootstrap: first call creates a super-user; idempotent.
      const { email, secret } = await request.json();
      if (secret !== process.env.JWT_SECRET) return json({ error: 'Forbidden' }, 403);
      await db.collection('users').updateOne({ email: (email||'').toLowerCase() }, { $set: { plan: 'super_user', role: 'admin' } });
      return json({ ok: true });
    }

    // ---------- DOWNLOADS (single + listing) ----------
    if (route === '/downloads/log' && method === 'POST') {
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      const { mediaIds = [] } = await request.json();
      await db.collection('downloads').insertOne({ id: uuidv4(), userId: user.id, mediaIds, createdAt: new Date() });
      return json({ ok: true });
    }

    if (route === '/' && method === 'GET') {
      return json({ app: 'SnapNext AI', ok: true });
    }

    // ---------- SETTINGS: EMAIL PREFERENCES ----------
    if (route === '/settings/email-prefs' && method === 'GET') {
      const user = await requireUser(request);
      if (!user) return json({ error: 'Unauthorized' }, 401);
      const prefs = user.emailPrefs || { product: true, community: true, favorites: true, marketing: false };
      return json({ prefs, emailVerified: !!user.emailVerified });
    }
    if (route === '/settings/email-prefs' && method === 'PUT') {
      const user = await requireUser(request);
      if (!user) return json({ error: 'Unauthorized' }, 401);
      const body = await request.json().catch(() => ({}));
      const allowed = ['product', 'community', 'favorites', 'marketing'];
      const updates = {};
      for (const k of allowed) if (k in body) updates[`emailPrefs.${k}`] = !!body[k];
      if (Object.keys(updates).length) await db.collection('users').updateOne({ id: user.id }, { $set: updates });
      const updated = await db.collection('users').findOne({ id: user.id });
      return json({ prefs: updated.emailPrefs });
    }

    // ---------- UNSUBSCRIBE (no auth, signed token) ----------
    if (route === '/unsubscribe' && (method === 'GET' || method === 'POST')) {
      let token = '';
      if (method === 'GET') {
        token = new URL(request.url).searchParams.get('t') || '';
      } else {
        const body = await request.json().catch(() => ({}));
        token = body.token || '';
      }
      const payload = verifyUnsubToken(token);
      if (!payload?.uid || !payload?.k) return json({ ok: false, reason: 'invalid' }, 400);
      // Only allow non-transactional pref keys.
      const allowed = ['product', 'community', 'favorites', 'marketing'];
      if (!allowed.includes(payload.k)) return json({ ok: false, reason: 'invalid_pref' }, 400);
      await db.collection('users').updateOne({ id: payload.uid }, { $set: { [`emailPrefs.${payload.k}`]: false } });
      return json({ ok: true, prefKey: payload.k });
    }

    // ---------- ADMIN: EMAIL EVENTS ----------
    if (route === '/admin/emails' && method === 'GET') {
      const user = await requireUser(request);
      if (!user || !isSuperUser(user)) return json({ error: 'Forbidden' }, 403);
      const url = new URL(request.url);
      const template = url.searchParams.get('template');
      const status = url.searchParams.get('status');
      const q = url.searchParams.get('q');
      const filter = {};
      if (template) filter.template = template;
      if (status) filter.status = status;
      if (q) filter.to = { $regex: q, $options: 'i' };
      const events = await db.collection('email_events').find(filter).sort({ sentAt: -1 }).limit(200).toArray();
      return json({ events: events.map(({ _id, ...e }) => e) });
    }

    // ---------- RESEND WEBHOOK ----------
    if (route === '/webhooks/resend' && method === 'POST') {
      const rawBody = await request.text();
      const secret = process.env.RESEND_WEBHOOK_SECRET;
      let verified = false;
      if (secret) {
        try {
          // Resend uses Svix signature headers: svix-id, svix-timestamp, svix-signature.
          const svixId = request.headers.get('svix-id') || '';
          const svixTs = request.headers.get('svix-timestamp') || '';
          const svixSigHeader = request.headers.get('svix-signature') || '';
          const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
          const signed = `${svixId}.${svixTs}.${rawBody}`;
          const expected = 'v1,' + crypto.createHmac('sha256', secretBytes).update(signed).digest('base64');
          const sigs = svixSigHeader.split(' ').filter(Boolean);
          verified = sigs.some(s => {
            try { return crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)); } catch { return false; }
          });
        } catch (e) { verified = false; }
        if (!verified) return json({ ok: false, error: 'invalid_signature' }, 401);
      }
      let payload = null;
      try { payload = JSON.parse(rawBody); } catch { return json({ ok: false, error: 'invalid_json' }, 400);}
      const type = payload?.type || payload?.event || 'unknown';
      const data = payload?.data || payload || {};
      const providerId = data?.email_id || data?.id || data?.message_id || null;
      const statusMap = {
        'email.sent': 'sent',
        'email.delivered': 'delivered',
        'email.opened': 'opened',
        'email.clicked': 'clicked',
        'email.bounced': 'bounced',
        'email.complained': 'complained',
        'email.delivery_delayed': 'delayed',
        'email.failed': 'failed',
      };
      const status = statusMap[type] || type;
      await recordWebhookEvent({ providerId, status, raw: { type, data, verified } });
      return json({ ok: true, status, providerId, verified });
    }

    // ---------- ADMIN: STORAGE HEALTH ----------
    if (route === '/admin/storage/health' && method === 'GET') {
      const user = await requireUser(request);
      if (!user || !isSuperUser(user)) return json({ error: 'Forbidden' }, 403);
      const health = await storage.health();
      // Recent upload errors from logs are not persisted; we surface per-media-provider counts instead.
      const counts = await db.collection('media').aggregate([
        { $group: { _id: { $ifNull: ['$provider', 'local'] }, count: { $sum: 1 }, bytes: { $sum: '$size' } } },
      ]).toArray();
      return json({ ...health, mediaCounts: counts });
    }

    // ---------- MEDIA: PRESIGNED DIRECT UPLOAD (S3 only) ----------
    if (route === '/media/presign-upload' && method === 'POST') {
      const user = await requireUser(request);
      if (!user) return json({ error: 'Unauthorized' }, 401);
      if (storage.active() !== 's3') return json({ error: 'Direct upload URLs require STORAGE_PROVIDER=s3' }, 400);
      const plan = effectivePlan(user, request);
      const singleUploadLimit = Math.min(storage.config.maxUploadBytes || Number.MAX_SAFE_INTEGER, plan.maxUploadBytes || Number.MAX_SAFE_INTEGER);

      const { name, mime, size } = await request.json().catch(() => ({}));
      if (!name) return json({ error: 'name required' }, 400);
      if (size && size > singleUploadLimit) return json({ error: 'File too large for single-shot upload. Use multipart.' }, 413);
      const fileId = uuidv4();
      try {
        const out = await storage.getUploadUrl({ userId: user.id, fileId, name, mime });
        return json({ ...out, fileId, expiresIn: 600 });
      } catch (e) {
        return json({ error: e?.message || 'Failed to sign upload URL' }, 502);
      }
    }

    // ========== FAVORITES ==========
    if (route === '/favorites' && method === 'GET') {
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      const all = await db.collection('favorites').find({
        $or: [{ requesterUserId: user.id }, { targetUserId: user.id }],
      }).sort({ createdAt: -1 }).toArray();
      const otherIds = [...new Set(all.map(f => f.requesterUserId === user.id ? f.targetUserId : f.requesterUserId))];
      const others = await db.collection('users').find({ id: { $in: otherIds } }).project({ id: 1, name: 1, email: 1, avatarColor: 1 }).toArray();
      const map = Object.fromEntries(others.map(u => [u.id, u]));
      const enrich = (f) => {
        const otherId = f.requesterUserId === user.id ? f.targetUserId : f.requesterUserId;
        return { ...clean(f), other: map[otherId] || { id: otherId, name: 'Unknown' }, role: f.requesterUserId === user.id ? 'requester' : 'target' };
      };
      return json({
        accepted: all.filter(f => f.status === 'accepted').map(enrich),
        incoming: all.filter(f => f.status === 'pending' && f.targetUserId === user.id).map(enrich),
        outgoing: all.filter(f => f.status === 'pending' && f.requesterUserId === user.id).map(enrich),
        blocked: all.filter(f => f.status === 'blocked').map(enrich),
      });
    }

    if (route === '/favorites/invite' && method === 'POST') {
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      const { email, query } = await request.json().catch(() => ({}));
      const needle = (email || query || '').toLowerCase().trim();
      if (!needle) return json({ error: 'Email required' }, 400);
      const target = await db.collection('users').findOne({ email: needle });
      if (!target) return json({ error: 'No SnapNext user found with that email. Ask them to sign up first.' }, 404);
      if (target.id === user.id) return json({ error: "You can't favorite yourself" }, 400);
      const existing = await db.collection('favorites').findOne({
        $or: [
          { requesterUserId: user.id, targetUserId: target.id },
          { requesterUserId: target.id, targetUserId: user.id },
        ],
      });
      if (existing) {
        if (existing.status === 'blocked') return json({ error: 'Blocked' }, 403);
        if (existing.status === 'accepted') return json({ ok: true, alreadyFavorites: true });
        if (existing.status === 'pending') return json({ ok: true, alreadyPending: true });
        await db.collection('favorites').updateOne({ id: existing.id }, { $set: { status: 'pending', requesterUserId: user.id, targetUserId: target.id, updatedAt: new Date() } });
      } else {
        await db.collection('favorites').insertOne({
          id: uuidv4(), requesterUserId: user.id, targetUserId: target.id,
          status: 'pending', createdAt: new Date(), updatedAt: new Date(),
        });
      }
      try {
        const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || ''}/favorites`;
        await sendEmail({
          template: 'favorites_invite', to: target.email, userId: target.id,
          data: { name: target.name, fromName: user.name, acceptUrl },
          prefs: target.emailPrefs, meta: { event: 'favorite_invite' },
        });
      } catch (e) { console.error('[favorites/invite] email failed', e?.message); }
      await notify(db, { userId: target.id, type: 'favorite_request', title: `${user.name} wants to be your favorite`, payload: { fromUserId: user.id, fromName: user.name } });
      return json({ ok: true });
    }

    const favActMatch = route.match(/^\/favorites\/([^/]+)\/(accept|decline|cancel|remove|block)$/);
    if (favActMatch && method === 'POST') {
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      const id = favActMatch[1]; const action = favActMatch[2];
      const fav = await db.collection('favorites').findOne({ id });
      if (!fav) return json({ error: 'Not found' }, 404);
      const isParticipant = fav.requesterUserId === user.id || fav.targetUserId === user.id;
      if (!isParticipant) return json({ error: 'Forbidden' }, 403);
      const otherId = fav.requesterUserId === user.id ? fav.targetUserId : fav.requesterUserId;

      if (action === 'accept') {
        if (fav.targetUserId !== user.id || fav.status !== 'pending') return json({ error: 'Not allowed' }, 403);
        await db.collection('favorites').updateOne({ id }, { $set: { status: 'accepted', acceptedAt: new Date(), updatedAt: new Date() } });
        await notify(db, { userId: fav.requesterUserId, type: 'favorite_accepted', title: `${user.name} accepted your favorite request`, payload: { fromUserId: user.id, fromName: user.name } });
        return json({ ok: true });
      }
      if (action === 'decline') {
        if (fav.targetUserId !== user.id) return json({ error: 'Only the recipient can decline' }, 403);
        await db.collection('favorites').updateOne({ id }, { $set: { status: 'declined', updatedAt: new Date() } });
        return json({ ok: true });
      }
      if (action === 'cancel') {
        if (fav.requesterUserId !== user.id || fav.status !== 'pending') return json({ error: 'Only sender can cancel pending' }, 403);
        await db.collection('favorites').deleteOne({ id });
        return json({ ok: true });
      }
      if (action === 'remove') {
        await db.collection('favorites').deleteOne({ id });
        await db.collection('favorite_permissions').deleteMany({ favoriteId: id });
        await db.collection('shared_photos').deleteMany({
          $or: [{ ownerUserId: user.id, recipientUserId: otherId }, { ownerUserId: otherId, recipientUserId: user.id }],
        });
        await db.collection('shared_album_members').deleteMany({ favoriteUserId: { $in: [user.id, otherId] } });
        await db.collection('shared_memories').deleteMany({
          $or: [{ ownerUserId: user.id, recipientUserId: otherId }, { ownerUserId: otherId, recipientUserId: user.id }],
        });
        return json({ ok: true });
      }
      if (action === 'block') {
        await db.collection('favorites').updateOne({ id }, { $set: { status: 'blocked', blockedBy: user.id, updatedAt: new Date() } });
        return json({ ok: true });
      }
    }

    const permMatch = route.match(/^\/favorites\/([^/]+)\/permissions$/);
    if (permMatch && (method === 'GET' || method === 'PUT')) {
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      const id = permMatch[1];
      const fav = await db.collection('favorites').findOne({ id });
      if (!fav) return json({ error: 'Not found' }, 404);
      if (fav.requesterUserId !== user.id && fav.targetUserId !== user.id) return json({ error: 'Forbidden' }, 403);
      if (method === 'GET') {
        const rec = await db.collection('favorite_permissions').findOne({ favoriteId: id, ownerUserId: user.id });
        const defaults = Object.fromEntries(FAVORITE_PERM_KEYS.map(k => [k, k === 'shareFuturePhotos' ? false : true]));
        return json({ perms: { ...defaults, ...(rec?.perms || {}) } });
      }
      const body = await request.json().catch(() => ({}));
      const perms = await setPerms(db, id, user.id, body);
      return json({ perms });
    }

    // ========== SHARED PHOTOS ==========
    if (route === '/shared/photos' && method === 'POST') {
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      const { mediaIds = [], recipientUserId } = await request.json().catch(() => ({}));
      if (!recipientUserId || !mediaIds.length) return json({ error: 'recipientUserId and mediaIds required' }, 400);
      const link = await getFavoriteLink(db, user.id, recipientUserId);
      if (!link) return json({ error: 'Not connected as favorites' }, 403);
      const mediaDocs = await db.collection('media').find({ id: { $in: mediaIds }, userId: user.id, trashed: { $ne: true } }).project({ id: 1 }).toArray();
      const allowed = mediaDocs.map(m => m.id);
      const now = new Date();
      for (const mid of allowed) {
        await db.collection('shared_photos').updateOne(
          { ownerUserId: user.id, recipientUserId, mediaId: mid },
          { $setOnInsert: { id: uuidv4(), ownerUserId: user.id, recipientUserId, mediaId: mid, sharedAt: now } },
          { upsert: true },
        );
      }
      await notify(db, { userId: recipientUserId, type: 'photos_shared', title: `${user.name} shared ${allowed.length} ${allowed.length === 1 ? 'photo' : 'photos'} with you`, payload: { count: allowed.length, fromUserId: user.id, fromName: user.name } });
      return json({ ok: true, shared: allowed.length });
    }

    if (route === '/shared/photos' && method === 'GET') {
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      const rows = await db.collection('shared_photos').find({ recipientUserId: user.id }).sort({ sharedAt: -1 }).toArray();
      const cache = {};
      const allowedRows = [];
      for (const r of rows) {
        if (cache[r.ownerUserId] === undefined) cache[r.ownerUserId] = await canViewOwnersResource(db, user.id, r.ownerUserId, 'shareSharedPhotos');
        if (cache[r.ownerUserId]) allowedRows.push(r);
      }
      const mediaIds = allowedRows.map(r => r.mediaId);
      const items = mediaIds.length ? await db.collection('media').find({ id: { $in: mediaIds }, trashed: { $ne: true } }).toArray() : [];
      const owners = await db.collection('users').find({ id: { $in: [...new Set(allowedRows.map(r => r.ownerUserId))] } }).project({ id: 1, name: 1, avatarColor: 1 }).toArray();
      const ownerMap = Object.fromEntries(owners.map(o => [o.id, o]));
      const itemMap = Object.fromEntries(items.map(i => [i.id, clean(i)]));
      const out = allowedRows.map(r => ({ ...r, media: itemMap[r.mediaId], owner: ownerMap[r.ownerUserId] })).filter(x => x.media);
      return json({ items: out });
    }

    // ========== SHARED ALBUMS ==========
    if (route === '/shared/albums' && method === 'GET') {
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      const owned = await db.collection('shared_albums').find({ ownerUserId: user.id }).sort({ createdAt: -1 }).toArray();
      const memberships = await db.collection('shared_album_members').find({ favoriteUserId: user.id }).toArray();
      const ids = memberships.map(m => m.albumId);
      const raw = ids.length ? await db.collection('shared_albums').find({ id: { $in: ids } }).toArray() : [];
      const shared = [];
      for (const a of raw) if (await canViewOwnersResource(db, user.id, a.ownerUserId, 'shareAlbums')) shared.push(a);
      return json({ owned: owned.map(clean), shared: shared.map(clean) });
    }

    if (route === '/shared/albums' && method === 'POST') {
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      const { name } = await request.json().catch(() => ({}));
      if (!name) return json({ error: 'Name required' }, 400);
      const doc = { id: uuidv4(), ownerUserId: user.id, name, createdAt: new Date(), updatedAt: new Date() };
      await db.collection('shared_albums').insertOne(doc);
      return json({ album: clean(doc) });
    }

    const albumMatch = route.match(/^\/shared\/albums\/([^/]+)$/);
    if (albumMatch && method === 'GET') {
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      const id = albumMatch[1];
      const album = await db.collection('shared_albums').findOne({ id });
      if (!album) return json({ error: 'Not found' }, 404);
      let allowed = album.ownerUserId === user.id;
      if (!allowed) {
        const member = await db.collection('shared_album_members').findOne({ albumId: id, favoriteUserId: user.id });
        if (member) allowed = await canViewOwnersResource(db, user.id, album.ownerUserId, 'shareAlbums');
      }
      if (!allowed) return json({ error: 'Forbidden' }, 403);
      const mediaLinks = await db.collection('shared_album_media').find({ albumId: id }).toArray();
      const items = mediaLinks.length ? await db.collection('media').find({ id: { $in: mediaLinks.map(m => m.mediaId) } }).toArray() : [];
      const members = await db.collection('shared_album_members').find({ albumId: id }).toArray();
      const memberUsers = members.length ? await db.collection('users').find({ id: { $in: members.map(m => m.favoriteUserId) } }).project({ id: 1, name: 1, avatarColor: 1 }).toArray() : [];
      return json({ album: clean(album), items: items.map(clean), members: memberUsers, isOwner: album.ownerUserId === user.id });
    }

    const albumActMatch = route.match(/^\/shared\/albums\/([^/]+)\/(invite|remove-member|add-media|remove-media|delete)$/);
    if (albumActMatch && method === 'POST') {
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      const id = albumActMatch[1]; const action = albumActMatch[2];
      const album = await db.collection('shared_albums').findOne({ id });
      if (!album) return json({ error: 'Not found' }, 404);
      if (album.ownerUserId !== user.id) return json({ error: 'Forbidden' }, 403);
      const body = await request.json().catch(() => ({}));

      if (action === 'invite') {
        const { favoriteUserId } = body;
        if (!favoriteUserId) return json({ error: 'favoriteUserId required' }, 400);
        const link = await getFavoriteLink(db, user.id, favoriteUserId);
        if (!link) return json({ error: 'Not connected as favorites' }, 403);
        await db.collection('shared_album_members').updateOne(
          { albumId: id, favoriteUserId },
          { $setOnInsert: { id: uuidv4(), albumId: id, favoriteUserId, addedAt: new Date() } },
          { upsert: true },
        );
        await notify(db, { userId: favoriteUserId, type: 'album_shared', title: `${user.name} shared album "${album.name}" with you`, payload: { albumId: id, fromUserId: user.id, fromName: user.name } });
        return json({ ok: true });
      }
      if (action === 'remove-member') { await db.collection('shared_album_members').deleteOne({ albumId: id, favoriteUserId: body.favoriteUserId }); return json({ ok: true }); }
      if (action === 'add-media') {
        const ids2 = body.mediaIds || [];
        const owned = await db.collection('media').find({ id: { $in: ids2 }, userId: user.id, trashed: { $ne: true } }).project({ id: 1 }).toArray();
        for (const m of owned) {
          await db.collection('shared_album_media').updateOne(
            { albumId: id, mediaId: m.id }, { $setOnInsert: { id: uuidv4(), albumId: id, mediaId: m.id, addedAt: new Date() } }, { upsert: true },
          );
        }
        return json({ ok: true, added: owned.length });
      }
      if (action === 'remove-media') { await db.collection('shared_album_media').deleteMany({ albumId: id, mediaId: { $in: body.mediaIds || [] } }); return json({ ok: true }); }
      if (action === 'delete') {
        await db.collection('shared_albums').deleteOne({ id });
        await db.collection('shared_album_members').deleteMany({ albumId: id });
        await db.collection('shared_album_media').deleteMany({ albumId: id });
        return json({ ok: true });
      }
    }

    // ========== SHARED MEMORIES ==========
    if (route === '/shared/memories' && method === 'POST') {
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      const { title, mediaIds = [], recipientUserId } = await request.json().catch(() => ({}));
      if (!recipientUserId || !mediaIds.length || !title) return json({ error: 'title, recipientUserId, mediaIds required' }, 400);
      const link = await getFavoriteLink(db, user.id, recipientUserId);
      if (!link) return json({ error: 'Not connected as favorites' }, 403);
      const owned = await db.collection('media').find({ id: { $in: mediaIds }, userId: user.id, trashed: { $ne: true } }).project({ id: 1 }).toArray();
      const doc = { id: uuidv4(), ownerUserId: user.id, recipientUserId, title, mediaIds: owned.map(m => m.id), sharedAt: new Date() };
      await db.collection('shared_memories').insertOne(doc);
      await notify(db, { userId: recipientUserId, type: 'memory_shared', title: `${user.name} shared memory "${title}"`, payload: { memoryId: doc.id, fromUserId: user.id, fromName: user.name } });
      return json({ memory: doc });
    }

    if (route === '/shared/memories' && method === 'GET') {
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      const rows = await db.collection('shared_memories').find({ recipientUserId: user.id }).sort({ sharedAt: -1 }).toArray();
      const allowed = [];
      for (const r of rows) if (await canViewOwnersResource(db, user.id, r.ownerUserId, 'shareMemories')) allowed.push(r);
      const mediaIdsAll = [...new Set(allowed.flatMap(r => r.mediaIds))];
      const items = mediaIdsAll.length ? await db.collection('media').find({ id: { $in: mediaIdsAll } }).toArray() : [];
      const itemMap = Object.fromEntries(items.map(i => [i.id, clean(i)]));
      const owners = await db.collection('users').find({ id: { $in: [...new Set(allowed.map(r => r.ownerUserId))] } }).project({ id: 1, name: 1, avatarColor: 1 }).toArray();
      const ownerMap = Object.fromEntries(owners.map(o => [o.id, o]));
      const out = allowed.map(r => ({ ...r, mediaItems: r.mediaIds.map(mid => itemMap[mid]).filter(Boolean), owner: ownerMap[r.ownerUserId] }));
      return json({ memories: out });
    }

    const memReactMatch = route.match(/^\/shared\/memories\/([^/]+)\/react$/);
    if (memReactMatch && method === 'POST') {
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      const id = memReactMatch[1];
      const mem = await db.collection('shared_memories').findOne({ id });
      if (!mem) return json({ error: 'Not found' }, 404);
      if (mem.recipientUserId !== user.id && mem.ownerUserId !== user.id) return json({ error: 'Forbidden' }, 403);
      const { emoji = '\u2764\ufe0f' } = await request.json().catch(() => ({}));
      await db.collection('memory_reactions').insertOne({ id: uuidv4(), sharedMemoryId: id, userId: user.id, emoji, createdAt: new Date() });
      if (mem.ownerUserId !== user.id) {
        await notify(db, { userId: mem.ownerUserId, type: 'memory_reaction', title: `${user.name} reacted ${emoji} to "${mem.title}"`, payload: { memoryId: id, emoji } });
      }
      return json({ ok: true });
    }

    // ========== NOTIFICATIONS ==========
    if (route === '/notifications' && method === 'GET') {
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      const items = await db.collection('notifications').find({ userId: user.id }).sort({ createdAt: -1 }).limit(50).toArray();
      const unread = await db.collection('notifications').countDocuments({ userId: user.id, read: false });
      return json({ items: items.map(clean), unread });
    }
    if (route === '/notifications/read' && method === 'POST') {
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      const { ids } = await request.json().catch(() => ({}));
      const filter = { userId: user.id };
      if (Array.isArray(ids) && ids.length) filter.id = { $in: ids };
      await db.collection('notifications').updateMany(filter, { $set: { read: true } });
      return json({ ok: true });
    }



    // ========== EXPORTS / ZIP ==========
    if (route === '/exports' && method === 'POST') {
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      const body = await request.json().catch(() => ({}));
      const { type = 'selected', mediaIds = [], albumId, memoryId, name } = body;
      let ids = [];
      if (type === 'selected') ids = mediaIds;
      else if (type === 'all') {
        const items = await db.collection('media').find({ userId: user.id, trashed: { $ne: true } }).project({ id: 1 }).toArray();
        ids = items.map(i => i.id);
      } else if (type === 'album') {
        const album = await db.collection('shared_albums').findOne({ id: albumId, ownerUserId: user.id });
        if (!album) return json({ error: 'Album not found or not owned' }, 404);
        const links = await db.collection('shared_album_media').find({ albumId }).toArray();
        ids = links.map(l => l.mediaId);
      } else if (type === 'memory') {
        const mem = await db.collection('shared_memories').findOne({ id: memoryId, ownerUserId: user.id });
        if (!mem) return json({ error: 'Memory not found or not owned' }, 404);
        ids = mem.mediaIds || [];
      }
      if (!ids.length) return json({ error: 'No media to export' }, 400);

      // Plan limit: max items per export (super bypasses).
      const plan = effectivePlan(user, request);
      if (plan.id !== 'super_user' && ids.length > plan.downloadsPerDay) {
        return json({ error: `Export exceeds your daily limit of ${plan.downloadsPerDay} items. Upgrade for more.` }, 429);
      }

      // Only owner can export their media — enforced by userId filter in 'selected' path.
      if (type === 'selected') {
        const owned = await db.collection('media').find({ id: { $in: ids }, userId: user.id }).project({ id: 1 }).toArray();
        ids = owned.map(o => o.id);
        if (!ids.length) return json({ error: 'No owned media in selection' }, 403);
      }

      const job = createJob({ userId: user.id, type, mediaIds: ids, name });
      await db.collection('export_jobs').insertOne(job);
      // Fire-and-forget worker.
      runExportJob(job.id).catch((e) => console.error('[export] runner crashed', e));
      return json({ job: clean(job) });
    }

    if (route === '/exports' && method === 'GET') {
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      cleanupExpiredExports().catch(() => {});
      const jobs = await db.collection('export_jobs').find({ userId: user.id }).sort({ createdAt: -1 }).limit(50).toArray();
      return json({ jobs: jobs.map(clean) });
    }

    const expGet = route.match(/^\/exports\/([^/]+)$/);
    if (expGet && method === 'GET') {
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      const job = await db.collection('export_jobs').findOne({ id: expGet[1], userId: user.id });
      if (!job) return json({ error: 'Not found' }, 404);
      return json({ job: clean(job) });
    }

    const expDl = route.match(/^\/exports\/([^/]+)\/download$/);
    if (expDl && method === 'GET') {
      const url = new URL(request.url);
      const token = url.searchParams.get('t');
      let user = await requireUser(request);
      if (!user && token) {
        const fakeReq = { headers: { get: (k) => k.toLowerCase() === 'authorization' ? `Bearer ${token}` : null } };
        user = await getUserFromRequest(fakeReq);
      }
      if (!user) return json({ error: 'Unauthorized' }, 401);
      const job = await db.collection('export_jobs').findOne({ id: expDl[1], userId: user.id });
      if (!job) return json({ error: 'Not found' }, 404);
      if (job.status === 'expired') return json({ error: 'Export expired' }, 410);
      if (job.status !== 'ready') return json({ error: `Export ${job.status}` }, 409);
      if (!job.zipPath || !fs.existsSync(job.zipPath)) return json({ error: 'ZIP file missing' }, 404);
      const buf = fs.readFileSync(job.zipPath);
      const res = new NextResponse(buf, { status: 200, headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${(job.name || 'export.zip').replace(/"/g, '')}"`,
        'Cache-Control': 'private, no-store',
      } });
      return cors(res);
    }

    const expRetry = route.match(/^\/exports\/([^/]+)\/retry$/);
    if (expRetry && method === 'POST') {
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      const job = await db.collection('export_jobs').findOne({ id: expRetry[1], userId: user.id });
      if (!job) return json({ error: 'Not found' }, 404);
      if (!['failed', 'expired'].includes(job.status)) return json({ error: 'Only failed or expired jobs can be retried' }, 400);
      await db.collection('export_jobs').updateOne({ id: job.id }, { $set: { status: 'queued', progress: 0, error: null, retriedAt: new Date() } });
      runExportJob(job.id).catch((e) => console.error('[export] retry runner crashed', e));
      return json({ ok: true });
    }

    // ========== INSIGHTS / SMART BACKUP ==========
    if (route === '/insights' && method === 'GET') {
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      const insights = await computeInsights(db, user, request);
      if (insights?.ok === false) return json({ error: insights.error }, insights.status || 403);
      return json(insights);
    }
    if (route === '/insights/ai-summary' && method === 'POST') {
      const user = await requireUser(request); if (!user) return json({ error: { code: 'unauthenticated', message: 'Please sign in to use SnapNext AI.' } }, 401);
      const insights = await computeInsights(db, user, request);
      if (insights?.ok === false) return json({ error: insights.error }, insights.status || 403);
      const facts = [
        `Total memories: ${insights.totals.count}`,
        insights.mostPhotographed ? `Most photographed: ${insights.mostPhotographed.label} (${insights.mostPhotographed.count} items)` : null,
        insights.thisMonth?.count ? `${insights.thisMonth.label}: ${insights.thisMonth.count} new` : null,
        insights.thisYear?.count ? `${insights.thisYear.label} so far: ${insights.thisYear.count}` : null,
        insights.duplicates.extraCopies ? `Duplicates: ${insights.duplicates.extraCopies} extra copies` : null,
        insights.largeVideos.count ? `${insights.largeVideos.count} large video(s)` : null,
        insights.forecast.monthsLeft != null ? `Storage forecast: ~${insights.forecast.monthsLeft} months until full at current pace` : null,
      ].filter(Boolean);
      const result = await runAiTask({ db, user, feature: 'memorySummary', input: { topic: facts.join(' | ') }, prompt: facts.join(' | ') || 'Summarize my SnapNext library', request });
      if (!result.ok) return aiJson(result);
      return json({ highlights: [readAiResult(result, 'summary')].filter(Boolean), insights, meta: result.meta });
    }

    return json({ error: `Route ${route} not found` }, 404);
  } catch (e) {
    console.error('API error:', e);
    return json({ error: e?.message || 'Internal error' }, 500);
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
export const PATCH = handle;
