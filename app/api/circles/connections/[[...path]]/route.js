import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { buildSourceDocument } from '@/lib/circles';
import {
  buildYouTubeAuthorizeUrl,
  connectorList,
  exchangeYouTubeCode,
  getConnector,
  importYouTubeSubscriptions,
  secureConnectionDocument,
  syncYouTubeUpdates,
} from '@/lib/circle-connectors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(data, status = 200) { return NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } }); }
function redirect(request, path) { return NextResponse.redirect(new URL(path, request.url)); }

async function ensureIndexes(db) {
  await Promise.allSettled([
    db.collection('circle_connections').createIndex({ userId: 1, platform: 1 }, { unique: true }),
    db.collection('circle_oauth_states').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('circle_import_candidates').createIndex({ userId: 1, status: 1, platform: 1 }),
    db.collection('circle_import_candidates').createIndex({ userId: 1, platform: 1, externalProfileId: 1 }, { unique: true }),
  ]);
}

export async function GET(request, context) { return handle(request, context); }
export async function POST(request, context) { return handle(request, context); }
export async function DELETE(request, context) { return handle(request, context); }

async function handle(request, context) {
  try {
    const db = await getDb();
    await ensureIndexes(db);
    const params = await context.params;
    const path = params?.path || [];
    const route = '/' + path.join('/');
    const method = request.method;

    if (route === '/youtube/callback' && method === 'GET') {
      const url = new URL(request.url);
      const state = url.searchParams.get('state');
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      if (error) return redirect(request, `/circles?connect=error&reason=${encodeURIComponent(error)}`);
      if (!state || !code) return redirect(request, '/circles?connect=error');
      const stateDoc = await db.collection('circle_oauth_states').findOne({ state, platform: 'youtube', expiresAt: { $gt: new Date() } });
      if (!stateDoc) return redirect(request, '/circles?connect=expired');
      const redirectUri = `${url.origin}/api/circles/connections/youtube/callback`;
      const tokenData = await exchangeYouTubeCode({ code, redirectUri });
      const connection = secureConnectionDocument({ userId: stateDoc.userId, platform: 'youtube', tokenData });
      await db.collection('circle_connections').updateOne(
        { userId: stateDoc.userId, platform: 'youtube' },
        { $set: { platform: 'youtube', userId: stateDoc.userId, accessTokenEncrypted: connection.accessTokenEncrypted, refreshTokenEncrypted: connection.refreshTokenEncrypted, expiresAt: connection.expiresAt, scope: connection.scope, tokenType: connection.tokenType, status: 'active', updatedAt: connection.updatedAt }, $setOnInsert: { id: connection.id, createdAt: connection.createdAt } },
        { upsert: true },
      );
      await db.collection('circle_oauth_states').deleteOne({ _id: stateDoc._id });
      return redirect(request, '/circles?connect=youtube');
    }

    const user = await getUserFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    if (route === '/' && method === 'GET') {
      const connections = await db.collection('circle_connections').find({ userId: user.id }).project({ accessTokenEncrypted: 0, refreshTokenEncrypted: 0, _id: 0 }).toArray();
      return json({ connectors: connectorList(), connections });
    }

    const authorizeMatch = route.match(/^\/([^/]+)\/authorize$/);
    if (authorizeMatch && method === 'POST') {
      const platform = authorizeMatch[1];
      const connector = getConnector(platform);
      if (!connector?.canAuthorize) return json({ error: 'This platform connection is not available yet.' }, 400);
      if (platform !== 'youtube') return json({ error: 'This connector is not active yet.' }, 400);
      const state = uuidv4();
      const origin = new URL(request.url).origin;
      const redirectUri = `${origin}/api/circles/connections/youtube/callback`;
      await db.collection('circle_oauth_states').insertOne({ state, userId: user.id, platform, createdAt: new Date(), expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
      return json({ authorizeUrl: buildYouTubeAuthorizeUrl({ state, redirectUri }) });
    }

    const importMatch = route.match(/^\/([^/]+)\/import$/);
    if (importMatch && method === 'POST') {
      const platform = importMatch[1];
      if (platform !== 'youtube') return json({ error: 'Automatic import is not available for this platform yet.' }, 400);
      const connection = await db.collection('circle_connections').findOne({ userId: user.id, platform, status: 'active' });
      if (!connection) return json({ error: 'Connect YouTube first.' }, 400);
      const imported = await importYouTubeSubscriptions({ db, userId: user.id, connection });
      return json({ imported });
    }

    const syncMatch = route.match(/^\/([^/]+)\/sync$/);
    if (syncMatch && method === 'POST') {
      const platform = syncMatch[1];
      if (platform !== 'youtube') return json({ error: 'Update sync is not available for this platform yet.' }, 400);
      const connection = await db.collection('circle_connections').findOne({ userId: user.id, platform, status: 'active' });
      if (!connection) return json({ error: 'Connect YouTube first.' }, 400);
      const synced = await syncYouTubeUpdates({ db, userId: user.id, connection });
      return json({ synced });
    }

    if (route === '/candidates' && method === 'GET') {
      const candidates = await db.collection('circle_import_candidates').find({ userId: user.id, status: 'pending_review' }).sort({ displayName: 1 }).limit(1000).project({ _id: 0 }).toArray();
      return json({ candidates });
    }

    if (route === '/candidates/accept' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const candidateIds = Array.isArray(body.candidateIds) ? body.candidateIds.slice(0, 500) : [];
      const circleId = String(body.circleId || '').trim();
      if (!candidateIds.length || !circleId) return json({ error: 'Select profiles and a Circle.' }, 400);
      const circle = await db.collection('circles').findOne({ id: circleId, userId: user.id, isArchived: { $ne: true } });
      if (!circle) return json({ error: 'Circle not found.' }, 404);
      const candidates = await db.collection('circle_import_candidates').find({ userId: user.id, id: { $in: candidateIds }, status: 'pending_review' }).toArray();
      let added = 0;
      for (const candidate of candidates) {
        const source = buildSourceDocument(user.id, circleId, { platform: candidate.platform, profileUrl: candidate.profileUrl, input: candidate.profileUrl, displayName: candidate.displayName });
        source.externalProfileId = candidate.externalProfileId;
        source.handle = candidate.handle || source.handle;
        source.avatarUrl = candidate.avatarUrl || null;
        source.connectionMode = 'public_api';
        source.connectionStatus = 'active';
        const exists = await db.collection('circle_sources').findOne({ userId: user.id, platform: source.platform, externalProfileId: source.externalProfileId });
        if (!exists) { await db.collection('circle_sources').insertOne(source); added += 1; }
        await db.collection('circle_import_candidates').updateOne({ id: candidate.id, userId: user.id }, { $set: { status: 'accepted', circleId, updatedAt: new Date() } });
      }
      return json({ added });
    }

    const disconnectMatch = route.match(/^\/([^/]+)$/);
    if (disconnectMatch && method === 'DELETE') {
      const platform = disconnectMatch[1];
      await db.collection('circle_connections').deleteOne({ userId: user.id, platform });
      return json({ ok: true });
    }

    return json({ error: 'Not found' }, 404);
  } catch (error) {
    console.error('[circle-connections]', error);
    return json({ error: error?.message || 'Social connection request failed.' }, 500);
  }
}
