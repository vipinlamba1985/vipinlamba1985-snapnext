import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { entitlementForUser } from '@/lib/entitlements';
import { resolveStorageScope, getStorageScopeUsage } from '@/lib/storage-scope';
import { storage } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BATCH = 5;
const HARD_MAX_BYTES = 100 * 1024 * 1024;
const PROVIDERS = new Set(['dropbox', 'onedrive']);
const DOC_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'rtf', 'odt', 'ods', 'odp']);
const DOC_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/rtf',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  'text/plain',
  'text/csv',
]);

function cleanName(value) {
  return String(value || 'Cloud file').replace(/[\r\n]/g, ' ').trim().slice(0, 180) || 'Cloud file';
}

function extension(name = '') {
  return (String(name).split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
}

function normalizeMime(value = '') {
  return String(value || '').split(';')[0].trim().toLowerCase();
}

function kindFor(name, mime) {
  if (mime.startsWith('image/')) return 'photo';
  if (mime.startsWith('video/')) return 'video';
  if (DOC_MIMES.has(mime) || DOC_EXTENSIONS.has(extension(name))) return 'document';
  return null;
}

function allowedHost(provider, hostname) {
  const host = String(hostname || '').toLowerCase();
  if (provider === 'dropbox') {
    return host === 'dropbox.com'
      || host.endsWith('.dropbox.com')
      || host === 'dropboxusercontent.com'
      || host.endsWith('.dropboxusercontent.com');
  }
  return host === 'onedrive.live.com'
    || host.endsWith('.onedrive.live.com')
    || host === '1drv.com'
    || host.endsWith('.1drv.com')
    || host === 'sharepoint.com'
    || host.endsWith('.sharepoint.com');
}

function checkedUrl(provider, raw) {
  let url;
  try { url = new URL(String(raw || '')); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
  return allowedHost(provider, url.hostname) ? url : null;
}

async function fetchSelectedFile(provider, rawUrl) {
  let current = checkedUrl(provider, rawUrl);
  if (!current) throw new Error('The selected cloud link is not trusted.');
  for (let hop = 0; hop < 4; hop += 1) {
    const response = await fetch(current, { redirect: 'manual', cache: 'no-store' });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      const next = location ? checkedUrl(provider, new URL(location, current).toString()) : null;
      if (!next) throw new Error('The selected cloud file redirected outside its trusted provider.');
      current = next;
      continue;
    }
    return response;
  }
  throw new Error('The selected cloud file redirected too many times.');
}

function guessedMime(name) {
  const ext = extension(name);
  const byExt = {
    pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain', csv: 'text/csv', rtf: 'application/rtf',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic',
    mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/x-m4v',
  };
  return byExt[ext] || '';
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const provider = String(body.provider || '').toLowerCase();
  const files = Array.isArray(body.files) ? body.files.slice(0, MAX_BATCH) : [];
  if (!PROVIDERS.has(provider)) return NextResponse.json({ error: 'Unsupported Smart Import provider.' }, { status: 400 });
  if (!files.length) return NextResponse.json({ error: 'Choose at least one cloud file.' }, { status: 400 });

  const db = await getDb();
  const entitlement = entitlementForUser(user, request);
  const plan = entitlement.plan;
  const storageScope = await resolveStorageScope({ db, user, plan });
  const scopeUsage = await getStorageScopeUsage({ db, scope: storageScope });
  let remaining = entitlement.realIsSuper ? Number.MAX_SAFE_INTEGER : Math.max(0, Number(storageScope.storageBytes || 0) - Number(scopeUsage.bytes || 0));
  const singleLimit = Math.min(Number(storage.config.maxUploadBytes || HARD_MAX_BYTES), Number(plan.maxUploadBytes || HARD_MAX_BYTES), HARD_MAX_BYTES);
  const results = [];

  for (const selected of files) {
    const name = cleanName(selected?.name);
    try {
      const declaredSize = Number(selected?.size || selected?.bytes || 0);
      if (declaredSize > singleLimit) throw new Error('File is too large for Smart Import.');
      if (declaredSize > remaining) throw new Error('Your SnapNext storage does not have enough space for this file.');

      const response = await fetchSelectedFile(provider, selected?.url || selected?.link);
      if (!response.ok) throw new Error('The cloud provider could not deliver this selected file.');
      const responseLength = Number(response.headers.get('content-length') || 0);
      if (responseLength > singleLimit) throw new Error('File is too large for Smart Import.');
      if (responseLength > remaining) throw new Error('Your SnapNext storage does not have enough space for this file.');

      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length) throw new Error('The selected cloud file was empty.');
      if (buffer.length > singleLimit) throw new Error('File is too large for Smart Import.');
      if (buffer.length > remaining) throw new Error('Your SnapNext storage does not have enough space for this file.');
      if (declaredSize && declaredSize !== buffer.length) throw new Error('The cloud file changed while SnapNext was copying it.');

      const mime = normalizeMime(response.headers.get('content-type')) || normalizeMime(selected?.mime) || guessedMime(name);
      const kind = kindFor(name, mime);
      if (!kind) throw new Error('SnapNext currently imports photos, videos, PDFs and common office documents from this picker.');

      const hash = crypto.createHash('sha256').update(buffer).digest('hex');
      const duplicate = await db.collection('media').findOne({ userId: user.id, hash, trashed: { $ne: true } });
      if (duplicate) {
        results.push({ name, status: 'skipped', reason: 'duplicate', mediaId: duplicate.id });
        continue;
      }

      const id = uuidv4();
      const saved = await storage.save({ userId: user.id, fileId: id, buffer, name, mime });
      const providerFileId = selected?.id ? String(selected.id).slice(0, 300) : null;
      await db.collection('media').insertOne({
        id,
        userId: user.id,
        householdId: storageScope.householdId || null,
        name,
        size: buffer.length,
        hash,
        mime,
        kind,
        storageKey: saved.storageKey,
        provider: saved.provider,
        favorite: false,
        trashed: false,
        cloudSource: {
          provider,
          fileId: providerFileId,
          importedAt: new Date(),
          mode: 'user_selected_picker',
        },
        verification: { sha256: hash, verifiedAt: new Date() },
        aiAnalysis: null,
        aiAnalysisStatus: 'not_requested',
        createdAt: new Date(),
        uploadedAt: new Date(),
      });
      remaining -= buffer.length;
      results.push({ name, status: 'saved', mediaId: id, kind, size: buffer.length });
    } catch (error) {
      results.push({ name, status: 'failed', message: error?.message || 'This selected file could not be imported.' });
    }
  }

  return NextResponse.json({
    provider,
    results,
    saved: results.filter(item => item.status === 'saved').length,
    skipped: results.filter(item => item.status === 'skipped').length,
    failed: results.filter(item => item.status === 'failed').length,
    remainingBytes: Math.max(0, remaining),
  });
}
