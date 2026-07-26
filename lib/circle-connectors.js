import { v4 as uuidv4 } from 'uuid';
import { decryptSecret, encryptSecret } from '@/lib/circle-token-vault';

export const SOCIAL_CONNECTORS = {
  youtube: {
    id: 'youtube',
    label: 'YouTube',
    status: 'available',
    canAuthorize: true,
    canImportFollowing: true,
    canReadUpdates: true,
    scope: 'https://www.googleapis.com/auth/youtube.readonly',
  },
  instagram: { id: 'instagram', label: 'Instagram', status: 'planned', canAuthorize: false, canImportFollowing: false, canReadUpdates: false },
  tiktok: { id: 'tiktok', label: 'TikTok', status: 'planned', canAuthorize: false, canImportFollowing: false, canReadUpdates: false },
  facebook: { id: 'facebook', label: 'Facebook', status: 'planned', canAuthorize: false, canImportFollowing: false, canReadUpdates: false },
  linkedin: { id: 'linkedin', label: 'LinkedIn', status: 'planned', canAuthorize: false, canImportFollowing: false, canReadUpdates: false },
  x: { id: 'x', label: 'X', status: 'planned', canAuthorize: false, canImportFollowing: false, canReadUpdates: false },
};

export function connectorList() { return Object.values(SOCIAL_CONNECTORS); }
export function getConnector(platform) { return SOCIAL_CONNECTORS[String(platform || '').toLowerCase()] || null; }

function youtubeConfig() {
  const clientId = String(process.env.YOUTUBE_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.YOUTUBE_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) throw new Error('YouTube connection is not configured yet.');
  return { clientId, clientSecret };
}

export function buildYouTubeAuthorizeUrl({ state, redirectUri }) {
  const { clientId } = youtubeConfig();
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: SOCIAL_CONNECTORS.youtube.scope, access_type: 'offline', include_granted_scopes: 'true', prompt: 'consent', state });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeYouTubeCode({ code, redirectUri }) {
  const { clientId, clientSecret } = youtubeConfig();
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }), cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(data.error_description || 'YouTube authorization could not be completed.');
  return data;
}

export function secureConnectionDocument({ userId, platform, tokenData }) {
  const now = new Date();
  return { id: uuidv4(), userId, platform, accessTokenEncrypted: encryptSecret(tokenData.access_token), refreshTokenEncrypted: tokenData.refresh_token ? encryptSecret(tokenData.refresh_token) : null, expiresAt: tokenData.expires_in ? new Date(Date.now() + Number(tokenData.expires_in) * 1000) : null, scope: tokenData.scope || null, tokenType: tokenData.token_type || 'Bearer', status: 'active', createdAt: now, updatedAt: now };
}

async function refreshYouTubeAccessToken(connection) {
  if (!connection.refreshTokenEncrypted) throw new Error('Reconnect YouTube to continue importing subscriptions.');
  const { clientId, clientSecret } = youtubeConfig();
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: decryptSecret(connection.refreshTokenEncrypted), grant_type: 'refresh_token' }), cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(data.error_description || 'YouTube access could not be refreshed.');
  return data;
}

export async function validYouTubeAccessToken(db, connection) {
  const stillValid = connection.expiresAt && new Date(connection.expiresAt).getTime() > Date.now() + 60_000;
  if (stillValid) return decryptSecret(connection.accessTokenEncrypted);
  const refreshed = await refreshYouTubeAccessToken(connection);
  const changes = { accessTokenEncrypted: encryptSecret(refreshed.access_token), expiresAt: refreshed.expires_in ? new Date(Date.now() + Number(refreshed.expires_in) * 1000) : null, updatedAt: new Date() };
  await db.collection('circle_connections').updateOne({ id: connection.id, userId: connection.userId }, { $set: changes });
  return refreshed.access_token;
}

export async function importYouTubeSubscriptions({ db, userId, connection }) {
  const token = await validYouTubeAccessToken(db, connection);
  const items = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({ part: 'snippet', mine: 'true', maxResults: '50' });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await fetch(`https://www.googleapis.com/youtube/v3/subscriptions?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || 'YouTube subscriptions could not be imported.');
    for (const item of data.items || []) {
      const snippet = item.snippet || {}; const resourceId = snippet.resourceId || {};
      if (!resourceId.channelId) continue;
      items.push({ platform: 'youtube', externalProfileId: resourceId.channelId, handle: resourceId.channelId, displayName: snippet.title || 'YouTube channel', profileUrl: `https://www.youtube.com/channel/${resourceId.channelId}`, avatarUrl: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || null, description: snippet.description || '' });
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken && items.length < 1000);

  const now = new Date();
  for (const profile of items) {
    await db.collection('circle_import_candidates').updateOne({ userId, platform: profile.platform, externalProfileId: profile.externalProfileId }, { $set: { ...profile, userId, status: 'pending_review', updatedAt: now }, $setOnInsert: { id: uuidv4(), createdAt: now } }, { upsert: true });
  }
  await db.collection('circle_connections').updateOne({ id: connection.id, userId }, { $set: { lastImportedAt: now, updatedAt: now } });
  return items.length;
}

function recencyScore(publishedAt) {
  const ageHours = Math.max(0, (Date.now() - new Date(publishedAt).getTime()) / 3_600_000);
  if (ageHours <= 12) return 25;
  if (ageHours <= 24) return 20;
  if (ageHours <= 72) return 12;
  if (ageHours <= 168) return 6;
  return 0;
}

export async function syncYouTubeUpdates({ db, userId, connection }) {
  const token = await validYouTubeAccessToken(db, connection);
  const sources = await db.collection('circle_sources').find({ userId, platform: 'youtube', connectionStatus: 'active', externalProfileId: { $exists: true } }).limit(60).toArray();
  if (!sources.length) return 0;
  const circles = await db.collection('circles').find({ userId, isArchived: { $ne: true } }).project({ id: 1, priority: 1 }).toArray();
  const circlePriority = Object.fromEntries(circles.map((circle) => [circle.id, Number(circle.priority || 50)]));
  let synced = 0;

  for (const source of sources) {
    const channelParams = new URLSearchParams({ part: 'contentDetails', id: source.externalProfileId, maxResults: '1' });
    const channelResponse = await fetch(`https://www.googleapis.com/youtube/v3/channels?${channelParams.toString()}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    const channelData = await channelResponse.json().catch(() => ({}));
    if (!channelResponse.ok) continue;
    const uploadsId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsId) continue;

    const playlistParams = new URLSearchParams({ part: 'snippet', playlistId: uploadsId, maxResults: '5' });
    const playlistResponse = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?${playlistParams.toString()}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    const playlistData = await playlistResponse.json().catch(() => ({}));
    if (!playlistResponse.ok) continue;

    for (const item of playlistData.items || []) {
      const snippet = item.snippet || {};
      const videoId = snippet.resourceId?.videoId;
      if (!videoId || !snippet.publishedAt) continue;
      const importanceScore = Math.min(100, Math.round(35 + (circlePriority[source.circleId] || 50) * 0.25 + Number(source.priority || 50) * 0.25 + recencyScore(snippet.publishedAt)));
      const update = {
        id: uuidv4(), userId, sourceId: source.id, circleId: source.circleId, platform: 'youtube', externalUpdateId: `youtube:${videoId}`, type: 'video', title: snippet.title || `${source.displayName} video`, excerpt: snippet.description ? snippet.description.slice(0, 280) : '', thumbnailUrl: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || null, externalUrl: `https://www.youtube.com/watch?v=${videoId}`, publishedAt: new Date(snippet.publishedAt), importanceScore, createdAt: new Date(), updatedAt: new Date(),
      };
      const result = await db.collection('circle_updates').updateOne({ userId, externalUpdateId: update.externalUpdateId }, { $set: { ...update, id: undefined, createdAt: undefined }, $setOnInsert: { id: update.id, createdAt: update.createdAt } }, { upsert: true });
      if (result.upsertedCount || result.modifiedCount) synced += 1;
    }
    await db.collection('circle_sources').updateOne({ id: source.id, userId }, { $set: { lastCheckedAt: new Date(), lastSuccessAt: new Date(), updatedAt: new Date() } });
  }
  await db.collection('circle_connections').updateOne({ id: connection.id, userId }, { $set: { lastSyncedAt: new Date(), updatedAt: new Date() } });
  return synced;
}
