import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import {
  importGoogleDriveAsset,
  inventoryGoogleDriveAssets,
} from '@/lib/smart-sync/google-drive-worker';
import {
  ensureCloudAssetIndexes,
  mergeSyncMetrics,
  metricsIncrementPatch,
  normalizeSyncMetrics,
} from '@/lib/smart-sync/cloud-assets';

export const runtime = 'nodejs';

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE = 'https://oauth2.googleapis.com/revoke';
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const OAUTH_COOKIE = 'snapnext_cloud_state';
const MAX_IMPORT_FILES = 10;
const DRIVE_FIELDS = 'id,name,mimeType,size,createdTime,modifiedTime,thumbnailLink,md5Checksum,sha1Checksum,sha256Checksum,version,trashed';

function json(data, status = 200) { return NextResponse.json(data, { status }); }
function appUrl(request) { return process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin; }
function redirectUri(request) { return `${appUrl(request)}/api/cloud/google-drive/callback`; }
function configured() { return Boolean(process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET && process.env.CLOUD_CONNECTOR_SECRET); }
function connectorSecret() { return process.env.CLOUD_CONNECTOR_SECRET || ''; }
function sign(value) { return crypto.createHmac('sha256', connectorSecret()).update(value).digest('base64url'); }
function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}
function createState(userId) {
  const payload = Buffer.from(JSON.stringify({ userId, nonce: crypto.randomUUID(), exp: Date.now() + 10 * 60 * 1000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
function readState(state) {
  try {
    const [payload, signature] = String(state || '').split('.');
    if (!payload || !signature) return null;
    const expected = sign(payload);
    if (!safeEqual(signature, expected)) return null;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return parsed.exp > Date.now() ? parsed : null;
  } catch { return null; }
}
function clearStateCookie(response) {
  response.cookies.set(OAUTH_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 });
  return response;
}
function cloudRedirect(request, result) {
  return clearStateCookie(NextResponse.redirect(`${appUrl(request)}/imports?cloud=${result}`));
}
function encryptionKey() { return crypto.createHash('sha256').update(connectorSecret()).digest(); }
function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}
function decrypt(value) {
  const [iv, tag, data] = String(value || '').split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
async function getConnection(db, userId) { return db.collection('cloud_connections').findOne({ userId, provider: 'google_drive' }); }

async function accessToken(db, connection) {
  if (connection.accessToken && connection.expiresAt && new Date(connection.expiresAt).getTime() > Date.now() + 60_000) return decrypt(connection.accessToken);
  if (!connection.refreshToken) throw new Error('Please reconnect Google Drive.');
  const response = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_DRIVE_CLIENT_ID, client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET, refresh_token: decrypt(connection.refreshToken), grant_type: 'refresh_token' }),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error('Please reconnect Google Drive.');
  await db.collection('cloud_connections').updateOne({ _id: connection._id }, { $set: { accessToken: encrypt(data.access_token), expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000), updatedAt: new Date() } });
  return data.access_token;
}

async function driveFiles(token, pageToken = '') {
  const params = new URLSearchParams({
    q: "trashed = false and (mimeType contains 'image/' or mimeType contains 'video/')",
    fields: `nextPageToken,files(${DRIVE_FIELDS})`,
    pageSize: '100',
    orderBy: 'modifiedTime desc',
  });
  if (pageToken) params.set('pageToken', pageToken);
  const response = await fetch(`${DRIVE_FILES}?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json();
  if (!response.ok) throw new Error('Google Drive could not be opened right now.');
  return data;
}

async function currentUsage(db, userId) {
  const [usage] = await db.collection('media').aggregate([
    { $match: { userId, trashed: { $ne: true } } },
    { $group: { _id: null, bytes: { $sum: '$size' } } },
  ]).toArray();
  return Number(usage?.bytes || 0);
}

async function recordManualMetrics(db, connection, metrics) {
  const increment = metricsIncrementPatch(metrics);
  const update = {
    $set: {
      lastSyncMetrics: normalizeSyncMetrics(metrics),
      lastAutoSyncAt: new Date(),
      updatedAt: new Date(),
    },
  };
  if (Object.keys(increment).length) update.$inc = increment;
  await db.collection('cloud_connections').updateOne({ _id: connection._id }, update);
}

export async function GET(request, context) {
  const action = (await context.params).action?.[0] || 'status';
  const db = await getDb();

  if (action === 'callback') {
    const url = new URL(request.url);
    const returnedState = url.searchParams.get('state') || '';
    const expectedState = request.cookies.get(OAUTH_COOKIE)?.value || '';
    const parsed = readState(returnedState);
    const sameBrowser = safeEqual(returnedState, expectedState);
    if (!parsed || !sameBrowser || url.searchParams.get('error')) return cloudRedirect(request, 'cancelled');

    const response = await fetch(GOOGLE_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: url.searchParams.get('code') || '', client_id: process.env.GOOGLE_DRIVE_CLIENT_ID, client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET, redirect_uri: redirectUri(request), grant_type: 'authorization_code' }),
    });
    const data = await response.json();
    if (!response.ok || !data.access_token) return cloudRedirect(request, 'failed');

    const set = {
      userId: parsed.userId,
      provider: 'google_drive',
      accessToken: encrypt(data.access_token),
      expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
      connectedAt: new Date(),
      smartSyncInitialCompleted: false,
      updatedAt: new Date(),
    };
    if (data.refresh_token) set.refreshToken = encrypt(data.refresh_token);
    await db.collection('cloud_connections').updateOne(
      { userId: parsed.userId, provider: 'google_drive' },
      {
        $set: set,
        $unset: {
          driveChangePageToken: '',
          driveInitialStartPageToken: '',
          smartSyncCursorAt: '',
          smartSyncInitialBeforeAt: '',
          smartSyncInitialNewestAt: '',
        },
      },
      { upsert: true },
    );
    await Promise.all([
      db.collection('cloud_assets').deleteMany({ userId: parsed.userId, provider: 'google_drive' }),
      db.collection('smart_sync_jobs').updateMany(
        { userId: parsed.userId, providerId: 'google_drive', status: { $in: ['queued', 'running', 'paused'] } },
        {
          $set: { status: 'stopped', stopRequested: true, pauseRequested: false, completedAt: new Date(), updatedAt: new Date() },
          $unset: { activeKey: '', leaseToken: '', leaseUntil: '' },
        },
      ),
    ]);
    return cloudRedirect(request, 'connected');
  }

  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Please sign in again.' }, 401);

  if (action === 'start') {
    if (!configured()) return json({ error: 'Google Drive connection is coming soon.' }, 503);
    const state = createState(user.id);
    const params = new URLSearchParams({ client_id: process.env.GOOGLE_DRIVE_CLIENT_ID, redirect_uri: redirectUri(request), response_type: 'code', scope: DRIVE_SCOPE, access_type: 'offline', prompt: 'consent', state, include_granted_scopes: 'true' });
    const response = json({ authorizationUrl: `${GOOGLE_AUTH}?${params}` });
    response.cookies.set(OAUTH_COOKIE, state, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 10 * 60 });
    return response;
  }

  const connection = await getConnection(db, user.id);
  if (action === 'files') {
    if (!connection) return json({ error: 'Connect Google Drive first.' }, 400);
    await ensureCloudAssetIndexes(db);
    const token = await accessToken(db, connection);
    const data = await driveFiles(token, new URL(request.url).searchParams.get('pageToken') || '');
    await inventoryGoogleDriveAssets({ db, userId: user.id, items: data.files || [] });
    const assets = await db.collection('cloud_assets').find({
      userId: user.id,
      provider: 'google_drive',
      providerFileId: { $in: (data.files || []).map(file => file.id) },
    }).toArray();
    const assetById = new Map(assets.map(asset => [asset.providerFileId, asset]));
    const metrics = normalizeSyncMetrics({
      discoveredItems: (data.files || []).length,
      metadataUpserts: (data.files || []).length,
      providerApiCalls: 1,
    });
    await recordManualMetrics(db, connection, metrics);
    return json({
      items: (data.files || []).map(file => {
        const asset = assetById.get(file.id);
        return {
          id: file.id,
          name: file.name,
          mime: file.mimeType,
          size: Number(file.size || 0),
          createdAt: file.createdTime,
          modifiedAt: file.modifiedTime,
          thumbnail: file.thumbnailLink,
          importState: asset?.importState || 'available_to_import',
          importOutcome: asset?.importOutcome || null,
        };
      }),
      nextPageToken: data.nextPageToken || null,
    });
  }

  return json({
    configured: configured(),
    connected: Boolean(connection),
    connectedAt: connection?.connectedAt || null,
    provider: 'Google Drive',
    incrementalCursorReady: Boolean(connection?.driveChangePageToken),
    metrics: normalizeSyncMetrics(connection?.syncMetrics),
  });
}

export async function POST(request, context) {
  const action = (await context.params).action?.[0] || '';
  if (action !== 'import') return json({ error: 'Not found.' }, 404);
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Please sign in again.' }, 401);
  const db = await getDb();
  const connection = await getConnection(db, user.id);
  if (!connection) return json({ error: 'Connect Google Drive first.' }, 400);
  const { fileIds = [] } = await request.json().catch(() => ({}));
  const ids = [...new Set(fileIds.map(value => String(value || '').trim()).filter(Boolean))].slice(0, MAX_IMPORT_FILES);
  if (!ids.length) return json({ error: 'Choose at least one photo or video.' }, 400);
  await ensureCloudAssetIndexes(db);
  const token = await accessToken(db, connection);
  const results = [];
  let usedBytes = await currentUsage(db, user.id);
  let metrics = normalizeSyncMetrics();

  for (const driveId of ids) {
    try {
      const result = await importGoogleDriveAsset({ db, token, user, driveId, usedBytes });
      metrics = mergeSyncMetrics(metrics, result.metrics);
      if (result.status === 'saved') usedBytes += result.size;
      results.push({
        id: driveId,
        status: result.status === 'saved' ? 'saved' : result.status === 'skipped' ? result.reason || 'duplicate' : result.status,
        mediaId: result.mediaId || null,
        message: result.message || null,
      });
    } catch (error) {
      results.push({ id: driveId, status: 'failed', message: error.message || 'This file could not be copied.' });
    }
  }

  await recordManualMetrics(db, connection, metrics);
  return json({
    results,
    saved: results.filter(item => item.status === 'saved').length,
    skipped: results.filter(item => ['already_imported', 'provider_checksum_duplicate', 'sha256_duplicate', 'duplicate'].includes(item.status)).length,
    failed: results.filter(item => ['failed', 'capacity'].includes(item.status)).length,
    metrics,
  });
}

export async function DELETE(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Please sign in again.' }, 401);
  const db = await getDb();
  const connection = await getConnection(db, user.id);
  if (connection) {
    try {
      const token = connection.refreshToken ? decrypt(connection.refreshToken) : connection.accessToken ? decrypt(connection.accessToken) : '';
      if (token) await fetch(GOOGLE_REVOKE, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }) });
    } catch (error) {
      console.error('[cloud-sync] Google revocation failed', error?.message || error);
    }
  }
  await Promise.all([
    db.collection('cloud_connections').deleteOne({ userId: user.id, provider: 'google_drive' }),
    db.collection('cloud_assets').deleteMany({ userId: user.id, provider: 'google_drive' }),
    db.collection('smart_sync_profiles').updateOne(
      { userId: user.id, providerId: 'google_drive' },
      { $set: { enabled: false, approvedAt: null, updatedAt: new Date() } },
    ),
    db.collection('smart_sync_jobs').updateMany(
      { userId: user.id, providerId: 'google_drive', status: { $in: ['queued', 'running', 'paused'] } },
      {
        $set: { status: 'stopped', stopRequested: true, pauseRequested: false, completedAt: new Date(), updatedAt: new Date() },
        $unset: { activeKey: '', leaseToken: '', leaseUntil: '' },
      },
    ),
  ]);
  return json({ ok: true });
}
