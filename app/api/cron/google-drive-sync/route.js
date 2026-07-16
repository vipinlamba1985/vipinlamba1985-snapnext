import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { storage } from '@/lib/storage';
import { entitlementForUser } from '@/lib/entitlements';
import { decryptCloudToken } from '@/lib/cloud-token-crypto';

export const runtime = 'nodejs';
export const maxDuration = 300;

const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const MAX_CONNECTIONS_PER_RUN = 20;
const MAX_FILES_PER_CONNECTION = 20;
const MAX_IMPORT_BYTES = 100 * 1024 * 1024;

function json(data, status = 200) { return NextResponse.json(data, { status }); }

async function freshAccessToken(connection) {
  if (!connection.refreshToken) throw new Error('Reconnect Google Drive.');
  const response = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_DRIVE_CLIENT_ID,
      client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
      refresh_token: decryptCloudToken(connection.refreshToken),
      grant_type: 'refresh_token',
    }),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error('Reconnect Google Drive.');
  return data.access_token;
}

async function syncConnection(db, connection) {
  const user = await db.collection('users').findOne({ id: connection.userId });
  if (!user) throw new Error('User account not found.');
  const token = await freshAccessToken(connection);
  const since = new Date(connection.autoSyncCursorAt || connection.autoSyncUpdatedAt || connection.connectedAt || Date.now()).toISOString();
  const params = new URLSearchParams({
    q: `trashed = false and modifiedTime > '${since}' and (mimeType contains 'image/' or mimeType contains 'video/')`,
    fields: 'files(id,name,mimeType,size,createdTime,modifiedTime)',
    pageSize: '100',
    orderBy: 'modifiedTime asc',
  });
  const response = await fetch(`${DRIVE_FILES}?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json();
  if (!response.ok) throw new Error('Google Drive could not be checked.');

  const files = (data.files || []).slice(0, MAX_FILES_PER_CONNECTION);
  const totals = { saved: 0, skipped: 0, failed: 0 };
  let cursor = new Date(connection.autoSyncCursorAt || connection.autoSyncUpdatedAt || connection.connectedAt || Date.now());

  for (const meta of files) {
    try {
      const modifiedAt = new Date(meta.modifiedTime || meta.createdTime || Date.now());
      if (modifiedAt > cursor) cursor = modifiedAt;
      const exists = await db.collection('media').findOne({ userId: connection.userId, 'cloudSource.provider': 'google_drive', 'cloudSource.fileId': meta.id });
      if (exists) { totals.skipped += 1; continue; }
      const size = Number(meta.size || 0);
      if (!size || size > MAX_IMPORT_BYTES) { totals.failed += 1; continue; }
      const entitlement = entitlementForUser(user);
      const usage = await db.collection('media').aggregate([{ $match: { userId: connection.userId, trashed: { $ne: true } } }, { $group: { _id: null, bytes: { $sum: '$size' } } }]).toArray();
      if (!entitlement.realIsSuper && entitlement.plan.storageBytes && (usage[0]?.bytes || 0) + size > entitlement.plan.storageBytes) { totals.failed += 1; break; }
      const fileResponse = await fetch(`${DRIVE_FILES}/${encodeURIComponent(meta.id)}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
      if (!fileResponse.ok) { totals.failed += 1; continue; }
      const buffer = Buffer.from(await fileResponse.arrayBuffer());
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');
      if (await db.collection('media').findOne({ userId: connection.userId, hash, trashed: { $ne: true } })) { totals.skipped += 1; continue; }
      const id = uuidv4();
      const saved = await storage.save({ userId: connection.userId, fileId: id, buffer, name: meta.name, mime: meta.mimeType });
      await db.collection('media').insertOne({
        id, userId: connection.userId, name: meta.name, size: buffer.length, hash, mime: meta.mimeType,
        kind: meta.mimeType.startsWith('video/') ? 'video' : 'photo', storageKey: saved.storageKey, provider: saved.provider,
        favorite: false, trashed: false,
        cloudSource: { provider: 'google_drive', fileId: meta.id, importedAt: new Date(), automatic: true },
        aiAnalysis: { tags: [], faces: [], autoAlbum: 'Cloud Imports' },
        createdAt: meta.createdTime ? new Date(meta.createdTime) : new Date(),
      });
      totals.saved += 1;
    } catch { totals.failed += 1; }
  }

  const now = new Date();
  await db.collection('cloud_connections').updateOne({ _id: connection._id }, { $set: { autoSyncCursorAt: cursor, lastAutoSyncAt: now, lastAutoSyncResult: totals, updatedAt: now } });
  return totals;
}

export async function GET(request) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return json({ error: 'Unauthorized' }, 401);
  const db = await getDb();
  const connections = await db.collection('cloud_connections').find({ provider: 'google_drive', autoSyncEnabled: true }).limit(MAX_CONNECTIONS_PER_RUN).toArray();
  const summary = { checked: 0, saved: 0, skipped: 0, failed: 0 };
  for (const connection of connections) {
    try {
      const result = await syncConnection(db, connection);
      summary.checked += 1;
      summary.saved += result.saved;
      summary.skipped += result.skipped;
      summary.failed += result.failed;
    } catch (error) {
      summary.checked += 1;
      summary.failed += 1;
      await db.collection('cloud_connections').updateOne({ _id: connection._id }, { $set: { lastAutoSyncAt: new Date(), lastAutoSyncError: error.message || 'Sync failed', updatedAt: new Date() } });
    }
  }
  return json({ ok: true, ...summary });
}
