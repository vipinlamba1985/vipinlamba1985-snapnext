import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { storage } from '@/lib/storage';
import { entitlementForUser } from '@/lib/entitlements';

export const runtime = 'nodejs';

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE = 'https://oauth2.googleapis.com/revoke';
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const OAUTH_COOKIE = 'snapnext_cloud_state';
const MAX_IMPORT_FILES = 10;
const MAX_IMPORT_BYTES = 100 * 1024 * 1024;

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
    fields: 'nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,thumbnailLink)',
    pageSize: '100',
    orderBy: 'modifiedTime desc',
  });
  if (pageToken) params.set('pageToken', pageToken);
  const response = await fetch(`${DRIVE_FILES}?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json();
  if (!response.ok) throw new Error('Google Drive could not be opened right now.');
  return data;
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

    const set = { userId: parsed.userId, provider: 'google_drive', accessToken: encrypt(data.access_token), expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000), connectedAt: new Date(), updatedAt: new Date() };
    if (data.refresh_token) set.refreshToken = encrypt(data.refresh_token);
    await db.collection('cloud_connections').updateOne({ userId: parsed.userId, provider: 'google_drive' }, { $set: set }, { upsert: true });
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
    const token = await accessToken(db, connection);
    const data = await driveFiles(token, new URL(request.url).searchParams.get('pageToken') || '');
    return json({ items: (data.files || []).map(file => ({ id: file.id, name: file.name, mime: file.mimeType, size: Number(file.size || 0), createdAt: file.createdTime, modifiedAt: file.modifiedTime, thumbnail: file.thumbnailLink })), nextPageToken: data.nextPageToken || null });
  }

  return json({ configured: configured(), connected: Boolean(connection), connectedAt: connection?.connectedAt || null, provider: 'Google Drive' });
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
  const ids = [...new Set(fileIds)].slice(0, MAX_IMPORT_FILES);
  if (!ids.length) return json({ error: 'Choose at least one photo or video.' }, 400);
  const token = await accessToken(db, connection);
  const results = [];

  for (const driveId of ids) {
    try {
      const metaResponse = await fetch(`${DRIVE_FILES}/${encodeURIComponent(driveId)}?fields=id,name,mimeType,size,createdTime`, { headers: { Authorization: `Bearer ${token}` } });
      const meta = await metaResponse.json();
      if (!metaResponse.ok || (!meta.mimeType?.startsWith('image/') && !meta.mimeType?.startsWith('video/'))) throw new Error('This item is not a supported photo or video.');
      const size = Number(meta.size || 0);
      if (!size || size > MAX_IMPORT_BYTES) throw new Error('This file is too large for cloud import right now.');
      if (await db.collection('media').findOne({ userId: user.id, 'cloudSource.provider': 'google_drive', 'cloudSource.fileId': driveId })) {
        results.push({ id: driveId, status: 'already_saved', name: meta.name });
        continue;
      }
      const entitlement = entitlementForUser(user);
      const usage = await db.collection('media').aggregate([{ $match: { userId: user.id, trashed: { $ne: true } } }, { $group: { _id: null, bytes: { $sum: '$size' } } }]).toArray();
      if (!entitlement.realIsSuper && entitlement.plan.storageBytes && (usage[0]?.bytes || 0) + size > entitlement.plan.storageBytes) throw new Error('There is not enough storage space for this file.');
      const fileResponse = await fetch(`${DRIVE_FILES}/${encodeURIComponent(driveId)}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
      if (!fileResponse.ok) throw new Error('This file could not be copied right now.');
      const buffer = Buffer.from(await fileResponse.arrayBuffer());
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');
      if (await db.collection('media').findOne({ userId: user.id, hash, trashed: { $ne: true } })) {
        results.push({ id: driveId, status: 'duplicate', name: meta.name });
        continue;
      }
      const id = uuidv4();
      const saved = await storage.save({ userId: user.id, fileId: id, buffer, name: meta.name, mime: meta.mimeType });
      await db.collection('media').insertOne({ id, userId: user.id, name: meta.name, size: buffer.length, hash, mime: meta.mimeType, kind: meta.mimeType.startsWith('video/') ? 'video' : 'photo', storageKey: saved.storageKey, provider: saved.provider, favorite: false, trashed: false, cloudSource: { provider: 'google_drive', fileId: driveId, importedAt: new Date() }, aiAnalysis: { tags: [], faces: [], autoAlbum: 'Cloud Imports' }, createdAt: meta.createdTime ? new Date(meta.createdTime) : new Date() });
      results.push({ id: driveId, status: 'saved', name: meta.name, mediaId: id });
    } catch (error) {
      results.push({ id: driveId, status: 'failed', message: error.message || 'This file could not be copied.' });
    }
  }

  return json({ results, saved: results.filter(item => item.status === 'saved').length, skipped: results.filter(item => ['duplicate', 'already_saved'].includes(item.status)).length, failed: results.filter(item => item.status === 'failed').length });
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
  await db.collection('cloud_connections').deleteOne({ userId: user.id, provider: 'google_drive' });
  return json({ ok: true });
}
