import { v4 as uuidv4 } from 'uuid';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { createSmartSyncJob, publicSmartSyncJob } from '@/lib/smart-sync/jobs';
import { normalizeSyncMetrics } from '@/lib/smart-sync/cloud-assets';
import { createGooglePhotosPickerSession, deleteGooglePhotosPickerSession, freshProviderAccessToken, getGooglePhotosPickerSession, listGooglePhotosItems } from '@/lib/smart-sync/provider-api';
import { inventoryCloudProviderAssets } from '@/lib/smart-sync/provider-importer';

export const runtime = 'nodejs';
export const maxDuration = 300;

function json(data, status = 200) { return NextResponse.json(data, { status }); }
async function authContext(request, routeContext) { const user = await getUserFromRequest(request); if (!user) return { error: json({ error: 'Please sign in again.' }, 401) }; const db = await getDb(); const action = (await routeContext.params).action || []; return { user, db, action }; }
async function connectionFor(db, userId) { const connection = await db.collection('cloud_connections').findOne({ userId, provider: 'google_photos' }); if (!connection) throw new Error('Connect Google Photos first.'); return connection; }
const IMPORT_PROFILE = { syncMode: 'protect_everything_that_fits', rules: [] };

export async function POST(request, routeContext) {
  const ctx = await authContext(request, routeContext); if (ctx.error) return ctx.error;
  const { user, db, action } = ctx;
  if (action[0] !== 'session') return json({ error: 'Not found.' }, 404);
  try {
    const connection = await connectionFor(db, user.id);
    const active = await db.collection('smart_sync_jobs').findOne({ activeKey: `${user.id}:google_photos` });
    if (active) return json({ error: 'A Google Photos import is already active.', job: publicSmartSyncJob(active) }, 409);
    const body = await request.json().catch(() => ({}));
    const token = await freshProviderAccessToken(db, connection);
    const session = await createGooglePhotosPickerSession(token, Math.min(Number(body.maxItemCount) || 500, 500));
    const now = new Date();
    await db.collection('smart_sync_picker_sessions').updateOne(
      { userId: user.id, provider: 'google_photos', sessionId: session.id },
      { $set: { userId: user.id, provider: 'google_photos', sessionId: session.id, status: 'selecting', pickerUri: session.pickerUri, expiresAt: session.expireTime ? new Date(session.expireTime) : new Date(Date.now() + 60 * 60 * 1000), updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
    return json({ sessionId: session.id, pickerUri: session.pickerUri ? `${session.pickerUri.replace(/\/$/, '')}/autoclose` : null, pollInterval: session.pollingConfig?.pollInterval || '3s', timeoutIn: session.pollingConfig?.timeoutIn || null }, 201);
  } catch (error) {
    return json({ error: error.message || 'Google Photos selection could not start.' }, 400);
  }
}

export async function GET(request, routeContext) {
  const ctx = await authContext(request, routeContext); if (ctx.error) return ctx.error;
  const { user, db, action } = ctx;
  if (action[0] !== 'session') return json({ error: 'Not found.' }, 404);
  const sessionId = new URL(request.url).searchParams.get('sessionId') || '';
  if (!sessionId) return json({ error: 'Google Photos session id is required.' }, 400);
  const localSession = await db.collection('smart_sync_picker_sessions').findOne({ userId: user.id, provider: 'google_photos', sessionId });
  if (!localSession) return json({ error: 'Google Photos session not found.' }, 404);
  if (localSession.jobId) {
    const job = await db.collection('smart_sync_jobs').findOne({ userId: user.id, id: localSession.jobId });
    return json({ ready: true, job: job ? publicSmartSyncJob(job) : null, itemCount: localSession.itemCount || 0 });
  }

  try {
    const connection = await connectionFor(db, user.id);
    const token = await freshProviderAccessToken(db, connection);
    const remoteSession = await getGooglePhotosPickerSession(token, sessionId);
    if (!remoteSession.mediaItemsSet) return json({ ready: false, pollInterval: remoteSession.pollingConfig?.pollInterval || '3s', timeoutIn: remoteSession.pollingConfig?.timeoutIn || null });

    const rawItems = [];
    let pageToken = '';
    do {
      const page = await listGooglePhotosItems(token, sessionId, pageToken);
      rawItems.push(...page.items);
      pageToken = page.nextPageToken || '';
    } while (pageToken && rawItems.length < 2000);

    const inventory = await inventoryCloudProviderAssets({ db, userId: user.id, provider: 'google_photos', items: rawItems });
    const sourceFileIds = inventory.importable;
    const automaticallySkipped = inventory.safeExisting + inventory.unsupported;
    const metrics = normalizeSyncMetrics({ discoveredItems: rawItems.length, indexedItems: inventory.importable.length, metadataUpserts: rawItems.length, providerApiCalls: 1 + Math.max(1, Math.ceil(rawItems.length / 100)), unsupportedItems: inventory.unsupported });
    const activeKey = `${user.id}:google_photos`;
    const existing = await db.collection('smart_sync_jobs').findOne({ activeKey });
    if (existing) return json({ ready: true, job: publicSmartSyncJob(existing), existing: true, itemCount: rawItems.length });

    const job = { id: uuidv4(), ...createSmartSyncJob({ userId: user.id, providerId: 'google_photos', profile: IMPORT_PROFILE, sourceFileIds, mode: 'manual_selection', estimate: { items: rawItems.length } }), pickerSessionId: sessionId, estimatedItems: rawItems.length, processedItems: automaticallySkipped, indexedItems: inventory.importable.length, skippedItems: automaticallySkipped, metrics };
    await db.collection('smart_sync_jobs').createIndex({ activeKey: 1 }, { unique: true, sparse: true });
    await db.collection('smart_sync_jobs').insertOne(job);
    await db.collection('smart_sync_picker_sessions').updateOne({ _id: localSession._id }, { $set: { status: 'ready', jobId: job.id, itemCount: rawItems.length, updatedAt: new Date() } });
    return json({ ready: true, job: publicSmartSyncJob(job), itemCount: rawItems.length }, 201);
  } catch (error) {
    await db.collection('smart_sync_picker_sessions').updateOne({ _id: localSession._id }, { $set: { status: 'failed', lastError: String(error.message || 'Google Photos selection failed').slice(0, 500), updatedAt: new Date() } });
    return json({ error: error.message || 'Google Photos selection could not finish.' }, 400);
  }
}

export async function DELETE(request, routeContext) {
  const ctx = await authContext(request, routeContext); if (ctx.error) return ctx.error;
  const { user, db, action } = ctx;
  if (action[0] !== 'session') return json({ error: 'Not found.' }, 404);
  const sessionId = new URL(request.url).searchParams.get('sessionId') || '';
  const localSession = await db.collection('smart_sync_picker_sessions').findOne({ userId: user.id, provider: 'google_photos', sessionId });
  if (!localSession) return json({ ok: true });
  try { const connection = await db.collection('cloud_connections').findOne({ userId: user.id, provider: 'google_photos' }); if (connection) { const token = await freshProviderAccessToken(db, connection); await deleteGooglePhotosPickerSession(token, sessionId); } } catch {}
  await db.collection('smart_sync_picker_sessions').deleteOne({ _id: localSession._id });
  return json({ ok: true });
}
