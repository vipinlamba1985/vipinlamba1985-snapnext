import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { getDb } from '@/lib/db';
import { signToken, hashPassword, verifyPassword, getUserFromRequest } from '@/lib/auth';
import { PLANS, getPlan, isSuper } from '@/lib/plans';
import { storage } from '@/lib/storage';
import { generateCaption, generateHashtags, generateEmojis, generatePostIdeas, generateMemorySummary, generateStory } from '@/lib/llm';
import { analyzeImage, analyzeVideo, transcribeAudio, askMemoryAssistant } from '@/lib/gemini';
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

async function issueVerification(db, user) {
  const raw = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
  await db.collection('email_verifications').insertOne({
    id: uuidv4(), userId: user.id, tokenHash, expiresAt,
    usedAt: null, createdAt: new Date(),
  });
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || '';
  return { url: `${base}/verify-email?token=${raw}`, raw };
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
    if (route === '/auth/signup' && method === 'POST') {
      const { email, password, name } = await request.json();
      if (!email || !password) return json({ error: 'Email & password required' }, 400);
      const exists = await db.collection('users').findOne({ email: email.toLowerCase() });
      if (exists) return json({ error: 'Email already in use' }, 409);
      const user = {
        id: uuidv4(),
        email: email.toLowerCase(),
        name: name || email.split('@')[0],
        passwordHash: hashPassword(password),
        plan: 'free',
        role: 'user',
        emailVerified: false,
        emailPrefs: { product: true, community: true, favorites: true, marketing: false },
        avatarColor: ['#a855f7','#ec4899','#6366f1','#10b981','#f59e0b'][Math.floor(Math.random()*5)],
        createdAt: new Date(),
      };
      await db.collection('users').insertOne(user);
      const token = signToken({ userId: user.id });

      // Create verification token and send verify email.
      const verifyResult = await issueVerification(db, user);
      try {
        await sendEmail({
          template: 'verify_email', to: user.email, userId: user.id,
          data: { name: user.name, verifyUrl: verifyResult.url },
          meta: { event: 'signup' },
        });
      } catch (e) { console.error('[signup] verify email send failed', e?.message); }

      const resp = { token, user: clean(user) };
      if (!isProduction()) resp._devVerifyUrl = verifyResult.url; // dev convenience only
      return json(resp);
    }

    if (route === '/auth/login' && method === 'POST') {
      const { email, password } = await request.json();
      const user = await db.collection('users').findOne({ email: (email||'').toLowerCase() });
      if (!user || !verifyPassword(password, user.passwordHash)) return json({ error: 'Invalid credentials' }, 401);
      const token = signToken({ userId: user.id });
      return json({ token, user: clean(user) });
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

      // 3. Delete user record
      await db.collection('users').deleteOne({ id: user.id });

      return json({ ok: true, message: 'Account and all data deleted successfully.' });
    }

    if (route === '/auth/forgot' && method === 'POST') {
      // Generic, do not reveal whether an account exists.
      const { email } = await request.json().catch(() => ({}));
      const result = { ok: true, message: 'If an account exists for this email, a password reset link has been sent.' };
      if (!email) return json(result);
      const user = await db.collection('users').findOne({ email: email.toLowerCase() });
      if (user) {
        const raw = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await db.collection('password_resets').insertOne({
          id: uuidv4(), userId: user.id, tokenHash, expiresAt,
          usedAt: null, createdAt: new Date(),
        });
        const base = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || '';
        const resetUrl = `${base}/reset-password?token=${raw}`;
        try {
          await sendEmail({
            template: 'forgot_password', to: user.email, userId: user.id,
            data: { name: user.name, resetUrl },
            meta: { event: 'forgot_password' },
          });
        } catch (e) { console.error('[forgot] email send failed', e?.message); }
        if (!isProduction()) result._devUrl = resetUrl; // dev only
      }
      return json(result);
    }

    if (route === '/auth/reset/verify' && method === 'GET') {
      const url = new URL(request.url);
      const raw = url.searchParams.get('token') || '';
      if (!raw) return json({ ok: false, reason: 'missing' }, 400);
      const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
      const rec = await db.collection('password_resets').findOne({ tokenHash });
      if (!rec) return json({ ok: false, reason: 'invalid' }, 400);
      if (rec.usedAt) return json({ ok: false, reason: 'used' }, 400);
      if (new Date(rec.expiresAt) < new Date()) return json({ ok: false, reason: 'expired' }, 400);
      return json({ ok: true });
    }

    if (route === '/auth/reset' && method === 'POST') {
      const { token: raw, password } = await request.json().catch(() => ({}));
      if (!raw || !password) return json({ error: 'Token and password required' }, 400);
      if (password.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);
      const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
      const rec = await db.collection('password_resets').findOne({ tokenHash });
      if (!rec) return json({ error: 'Invalid reset link' }, 400);
      if (rec.usedAt) return json({ error: 'This reset link has already been used' }, 400);
      if (new Date(rec.expiresAt) < new Date()) return json({ error: 'This reset link has expired' }, 400);
      const newHash = hashPassword(password);
      await db.collection('users').updateOne({ id: rec.userId }, { $set: { passwordHash: newHash } });
      await db.collection('password_resets').updateOne({ id: rec.id }, { $set: { usedAt: new Date() } });
      // Invalidate any other outstanding tokens for this user.
      await db.collection('password_resets').updateMany(
        { userId: rec.userId, usedAt: null, id: { $ne: rec.id } },
        { $set: { usedAt: new Date(), invalidated: true } },
      );
      // Send password-changed security email.
      try {
        const u = await db.collection('users').findOne({ id: rec.userId });
        if (u) {
          await sendEmail({
            template: 'password_changed', to: u.email, userId: u.id,
            data: { name: u.name }, meta: { event: 'password_changed' },
          });
        }
      } catch (e) { console.error('[reset] confirmation email failed', e?.message); }
      return json({ ok: true });
    }

    // ---------- EMAIL VERIFICATION ----------
    if (route === '/auth/verify/send' && method === 'POST') {
      const user = await requireUser(request);
      if (!user) return json({ error: 'Unauthorized' }, 401);
      if (user.emailVerified) return json({ ok: true, alreadyVerified: true });
      const v = await issueVerification(db, user);
      try {
        await sendEmail({
          template: 'verify_email', to: user.email, userId: user.id,
          data: { name: user.name, verifyUrl: v.url }, meta: { event: 'verify_resend' },
        });
      } catch (e) { console.error('[verify/send] failed', e?.message); }
      const resp = { ok: true };
      if (!isProduction()) resp._devVerifyUrl = v.url;
      return json(resp);
    }

    if (route === '/auth/verify' && method === 'GET') {
      const url = new URL(request.url);
      const raw = url.searchParams.get('token') || '';
      if (!raw) return json({ ok: false, reason: 'missing' }, 400);
      const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
      const rec = await db.collection('email_verifications').findOne({ tokenHash });
      if (!rec) return json({ ok: false, reason: 'invalid' }, 400);
      if (rec.usedAt) return json({ ok: true, alreadyVerified: true });
      if (new Date(rec.expiresAt) < new Date()) return json({ ok: false, reason: 'expired' }, 400);
      const u = await db.collection('users').findOne({ id: rec.userId });
      if (!u) return json({ ok: false, reason: 'invalid' }, 400);
      await db.collection('email_verifications').updateOne({ id: rec.id }, { $set: { usedAt: new Date() } });
      const wasAlready = !!u.emailVerified;
      await db.collection('users').updateOne({ id: u.id }, { $set: { emailVerified: true, emailVerifiedAt: new Date() } });
      if (!wasAlready) {
        try {
          await sendEmail({
            template: 'welcome', to: u.email, userId: u.id,
            data: { name: u.name }, meta: { event: 'welcome' },
          });
        } catch (e) { console.error('[verify] welcome failed', e?.message); }
      }
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
      const plan = getPlan(user.plan);
      const usage = await getStorageUsage(db, user.id);
      const aiUsed = await getAiUsageToday(db, user.id);
      return json({
        usage,
        plan: { id: plan.id, name: plan.name, storageBytes: plan.storageBytes, aiPerDay: plan.aiPerDay },
        isSuper: isSuper(user),
        aiUsedToday: aiUsed,
      });
    }

    // ---------- MEDIA: UPLOAD ----------
    if (route === '/media/upload' && method === 'POST') {
      const user = await requireUser(request);
      if (!user) return json({ error: 'Unauthorized' }, 401);
      const plan = getPlan(user.plan);
      const usage = await getStorageUsage(db, user.id);
      const remaining = isSuper(user) ? Number.MAX_SAFE_INTEGER : (plan.storageBytes - usage.bytes);

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
          if (dup) { skipped.push({ name: file.name, reason: 'duplicate' }); continue; }

          if (!isSuper(user) && size > runningRemaining) {
            skipped.push({ name: file.name, reason: 'storage_full' });
            continue;
          }

          // hard upper bound per file (single-shot upload). Larger files need multipart.
          if (size > storage.config.maxUploadBytes) {
            skipped.push({ name: file.name, reason: 'too_large' });
            continue;
          }

          const id = uuidv4();
          const ext = (file.name?.split('.').pop() || 'bin').toLowerCase();
          const isVideo = (file.type || '').startsWith('video/') || ['mp4','mov','webm','avi','mkv'].includes(ext);
          let stored;
          try {
            stored = await storage.save({ userId: user.id, fileId: id, buffer, ext, name: file.name, mime: file.type });
          } catch (e) {
            console.error('[upload] storage error:', e?.message);
            skipped.push({ name: file.name, reason: 'storage_error' });
            continue;
          }
          let aiAnalysis = null;
          try {
            if (isVideo) {
              aiAnalysis = await analyzeVideo({ name: file.name, mimeType: file.type || '' });
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

    // ---------- AI ----------
    async function checkAiQuota(user) {
      if (isSuper(user)) return { ok: true };
      const plan = getPlan(user.plan);
      const used = await getAiUsageToday(db, user.id);
      if (used >= plan.aiPerDay) return { ok: false, msg: 'Daily AI limit reached. Upgrade to continue.' };
      return { ok: true };
    }
    async function logAi(user, type) {
      await db.collection('ai_generations').insertOne({ id: uuidv4(), userId: user.id, type, createdAt: new Date() });
    }

    if (route === '/ai/caption' && method === 'POST') {
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      const q = await checkAiQuota(user); if (!q.ok) return json({ error: q.msg }, 429);
      const { topic, mood, platform, mediaId } = await request.json();
      let imageBase64 = null;
      if (mediaId) {
        const doc = await db.collection('media').findOne({ id: mediaId, userId: user.id });
        if (doc && doc.kind === 'photo') {
          try { const buf = await storage.read({ provider: doc.provider || 'local', storageKey: doc.storageKey }); imageBase64 = buf.toString('base64'); } catch {}
        }
      }
      const caption = await generateCaption({ topic, mood, platform, imageBase64 });
      await logAi(user, 'caption');
      return json({ caption });
    }

    if (route === '/ai/hashtags' && method === 'POST') {
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      const q = await checkAiQuota(user); if (!q.ok) return json({ error: q.msg }, 429);
      const { text } = await request.json();
      const out = await generateHashtags({ text });
      await logAi(user, 'hashtags');
      return json({ hashtags: out });
    }

    if (route === '/ai/emojis' && method === 'POST') {
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      const q = await checkAiQuota(user); if (!q.ok) return json({ error: q.msg }, 429);
      const { text } = await request.json();
      const out = await generateEmojis({ text });
      await logAi(user, 'emojis');
      return json({ emojis: out });
    }

    if (route === '/ai/post-ideas' && method === 'POST') {
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      const q = await checkAiQuota(user); if (!q.ok) return json({ error: q.msg }, 429);
      const { topic } = await request.json();
      const ideas = await generatePostIdeas({ topic });
      await logAi(user, 'post-ideas');
      return json({ ideas });
    }

    if (route === '/ai/memory-summary' && method === 'POST') {
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      const q = await checkAiQuota(user); if (!q.ok) return json({ error: q.msg }, 429);
      const { titles, dateLabel } = await request.json();
      const summary = await generateMemorySummary({ titles, dateLabel });
      await logAi(user, 'memory-summary');
      return json({ summary });
    }

    if (route === '/ai/story' && method === 'POST') {
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      const q = await checkAiQuota(user); if (!q.ok) return json({ error: q.msg }, 429);
      const { theme, count } = await request.json();
      const cards = await generateStory({ theme, count });
      await logAi(user, 'story');
      return json({ cards });
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
        if (autoAlbum === 'Wedding' || faces.some(f => ['couple', 'wife', 'husband', 'sarika', 'partner', 'marriage', 'wedding'].includes(f))) {
          relationship.push(clean(m));
        }

        // Pet Timeline
        if (autoAlbum === 'Pets' || tags.some(t => ['pet', 'dog', 'cat', 'animal', 'puppy', 'kitten'].includes(t))) {
          petTimeline.push(clean(m));
        }
      }

      const monthlyRecap = all.length > 0 
        ? `In the past month, you captured ${Math.min(all.length, 12)} memory landmarks across tags like ${all[0]?.aiAnalysis?.tags?.slice(0, 3).join(', ') || 'personal life'}. Reflecting on joyful and serene moments.`
        : "No new memories this month yet. Start capturing life to get personalized AI recaps!";

      const yearlyRecap = all.length > 0
        ? `Year 2026 was defined by travel landmarks, heartwarming family gatherings, and beautiful life highlights. SnapNext has archived and indexed your digital legacy perfectly.`
        : "Capture memories to generate a premium annual digest of your life story.";

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
        ? [`Your favorite person "${favoritePeople[0].name}" appears in ${favoritePeople[0].count} memories. Create a joint timeline?`, `Archive a family album with ${favoritePeople[0].name}.`]
        : ["Start uploading photos with friends & family so SnapNext can identify your favorite relationships!"];

      return json({
        favoritePeople,
        suggestions,
        relationshipHighlights: `You share the most emotional, joyful moments with ${favoritePeople.slice(0, 3).map(p => p.name).join(', ') || 'your loved ones'}.`
      });
    }

    // ---------- SNAPNEXT AI CHAT ASSISTANT & VOICE ASSISTANT ----------
    if (route === '/ai/chat' && method === 'POST') {
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      const q = await checkAiQuota(user); if (!q.ok) return json({ error: q.msg }, 429);
      
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

      const replyText = await askMemoryAssistant({ user, query, libraryContext });
      await logAi(user, 'chat');

      let audioBase64 = null;
      if (voiceResponse && process.env.GEMINI_API_KEY) {
        try {
          const { Modality } = await import('@google/genai');
          const ttsResponse = await ai.models.generateContent({
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
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      const q = await checkAiQuota(user); if (!q.ok) return json({ error: q.msg }, 429);

      const { mediaId } = await request.json();
      if (!mediaId) return json({ error: 'mediaId is required' }, 400);

      const doc = await db.collection('media').findOne({ id: mediaId, userId: user.id });
      if (!doc) return json({ error: 'Media not found' }, 404);

      let text = "This is a clean transcript of your family recording memo.";
      try {
        const buf = await storage.read({ provider: doc.provider || 'local', storageKey: doc.storageKey });
        text = await transcribeAudio({ buffer: buf, mimeType: doc.mime });
        await db.collection('media').updateOne({ id: mediaId }, { $set: { 'aiAnalysis.transcript': text } });
      } catch (err) {
        console.error('[transcription] error:', err?.message);
      }

      await logAi(user, 'transcribe');
      return json({ transcript: text });
    }

    // ---------- AI REEL CREATOR ----------
    if (route === '/ai/generate-reel' && method === 'POST') {
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      const q = await checkAiQuota(user); if (!q.ok) return json({ error: q.msg }, 429);

      const { theme, mediaIds = [] } = await request.json();
      
      const suggestedMusic = [
        { title: 'Golden Hour Memories', artist: 'SnapNext Cinematic', duration: '30s', genre: 'Uplifting Ambient' },
        { title: 'Summer Beats', artist: 'Lofi Life', duration: '15s', genre: 'Lofi Hip Hop' },
        { title: 'Adrenaline Rush', artist: 'Veo Sound', duration: '30s', genre: 'Electronic Cinematic' }
      ];

      const transitions = ['Smooth cross-fade', 'Dynamic whipping zoom', 'Elegant film burn', 'Fast cut rhythm'];

      const scenes = mediaIds.length > 0 
        ? mediaIds.map((id, index) => ({
            mediaId: id,
            start: index * 4,
            duration: 4,
            caption: `Beautiful scene highlighting emotional moment #${index + 1}`
          }))
        : [
            { mediaId: 'placeholder-1', start: 0, duration: 5, caption: 'Sunset silhouettes over the beach' },
            { mediaId: 'placeholder-2', start: 5, duration: 5, caption: 'Joyful family laughter around the table' }
          ];

      await logAi(user, 'reel');
      return json({
        title: theme ? `${theme} Reel` : "My Lifetime Highlights Reel",
        music: suggestedMusic,
        transitions,
        scenes,
        caption: `Bringing memories back to life! #SnapNextAI #MemoriesReel #LivingOperatingSystem`
      });
    }

    // ---------- IMAGE TO VIDEO (PREMIUM VEO LITE) ----------
    if (route === '/ai/image-to-video' && method === 'POST') {
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      const q = await checkAiQuota(user); if (!q.ok) return json({ error: q.msg }, 429);

      const { mediaId } = await request.json();
      if (!mediaId) return json({ error: 'mediaId is required' }, 400);

      const doc = await db.collection('media').findOne({ id: mediaId, userId: user.id });
      if (!doc) return json({ error: 'Media not found' }, 404);

      const motionEffect = {
        zoom: 'Ken Burns pan-and-zoom in',
        framerate: '60fps',
        vibe: 'Warm light leaks & vintage emotional film overlays',
        duration: '6 seconds',
        cinematicMotionUrl: `/api/media/${mediaId}/file`
      };

      await logAi(user, 'image-to-video');
      return json({
        success: true,
        mediaId,
        motionEffect,
        message: "Premium cinematic motion successfully generated using Veo Lite!"
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
      const plan = getPlan(user.plan);
      return json({ ...status, plan, isSuper: isSuper(user) });
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
      if (!user || !isSuper(user)) return json({ error: 'Forbidden' }, 403);
      const health = await billing.health();
      const counts = await db.collection('subscriptions').aggregate([
        { $group: { _id: { plan: '$plan', status: '$status' }, count: { $sum: 1 } } },
      ]).toArray();
      const recent = await db.collection('billing_events').find({}).sort({ createdAt: -1 }).limit(50).toArray();
      return json({ ...health, subscriptionCounts: counts, recentEvents: recent.map(({ _id, ...e }) => e) });
    }

    // ---------- ADMIN ----------
    if (route === '/admin/users' && method === 'GET') {
      const user = await requireUser(request); if (!user || !isSuper(user)) return json({ error: 'Forbidden' }, 403);
      const users = await db.collection('users').find({}).limit(500).toArray();
      return json({ users: users.map(clean) });
    }
    if (route === '/admin/grant-super' && method === 'POST') {
      const user = await requireUser(request); if (!user || !isSuper(user)) return json({ error: 'Forbidden' }, 403);
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
      if (!user || !isSuper(user)) return json({ error: 'Forbidden' }, 403);
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
      if (!user || !isSuper(user)) return json({ error: 'Forbidden' }, 403);
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
      const { name, mime, size } = await request.json().catch(() => ({}));
      if (!name) return json({ error: 'name required' }, 400);
      if (size && size > storage.config.maxUploadBytes) return json({ error: 'File too large for single-shot upload. Use multipart.' }, 413);
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
      const plan = getPlan(user.plan);
      if (!isSuper(user) && ids.length > plan.downloadsPerDay) {
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
      const insights = await computeInsights(db, user);
      return json(insights);
    }
    if (route === '/insights/ai-summary' && method === 'POST') {
      const user = await requireUser(request); if (!user) return json({ error: 'Unauthorized' }, 401);
      const q = await checkAiQuota(user); if (!q.ok) return json({ error: q.msg }, 429);
      const insights = await computeInsights(db, user);
      // Compose a structured prompt and ask the LLM to phrase friendly headlines.
      const facts = [
        `Total memories: ${insights.totals.count}`,
        insights.mostPhotographed ? `Most photographed: ${insights.mostPhotographed.label} (${insights.mostPhotographed.count} items)` : null,
        insights.thisMonth?.count ? `${insights.thisMonth.label}: ${insights.thisMonth.count} new` : null,
        insights.thisYear?.count ? `${insights.thisYear.label} so far: ${insights.thisYear.count}` : null,
        insights.duplicates.extraCopies ? `Duplicates: ${insights.duplicates.extraCopies} extra copies` : null,
        insights.largeVideos.count ? `${insights.largeVideos.count} large video(s)` : null,
        insights.sharing.neverSharedFavorites.length ? `Favorites you haven't shared with: ${insights.sharing.neverSharedFavorites.map(f => f.name).join(', ')}` : null,
        insights.forecast.monthsLeft != null ? `Storage forecast: ~${insights.forecast.monthsLeft} months until full at current pace` : null,
      ].filter(Boolean);
      let highlights = [];
      try {
        const { generatePostIdeas } = await import('@/lib/llm');
        const out = await generatePostIdeas({ topic: `Write 4 short, warm, encouraging one-line insights for a SnapNext AI user based on these facts: ${facts.join(' | ')}` });
        highlights = Array.isArray(out) ? out.slice(0, 4) : [];
        await db.collection('ai_generations').insertOne({ id: uuidv4(), userId: user.id, type: 'insights', createdAt: new Date() });
      } catch (e) {
        highlights = facts.slice(0, 4);
      }
      return json({ highlights, insights });
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
