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

export function connectorList() {
  return Object.values(SOCIAL_CONNECTORS);
}

export function getConnector(platform) {
  return SOCIAL_CONNECTORS[String(platform || '').toLowerCase()] || null;
}

function youtubeConfig() {
  const clientId = String(process.env.YOUTUBE_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.YOUTUBE_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) throw new Error('YouTube connection is not configured yet.');
  return { clientId, clientSecret };
}

export function buildYouTubeAuthorizeUrl({ state, redirectUri }) {
  const { clientId } = youtubeConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SOCIAL_CONNECTORS.youtube.scope,
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeYouTubeCode({ code, redirectUri }) {
  const { clientId, clientSecret } = youtubeConfig();
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(data.error_description || 'YouTube authorization could not be completed.');
  return data;
}

export function secureConnectionDocument({ userId, platform, tokenData }) {
  const now = new Date();
  return {
    id: uuidv4(),
    userId,
    platform,
    accessTokenEncrypted: encryptSecret(tokenData.access_token),
    refreshTokenEncrypted: tokenData.refresh_token ? encryptSecret(tokenData.refresh_token) : null,
    expiresAt: tokenData.expires_in ? new Date(Date.now() + Number(tokenData.expires_in) * 1000) : null,
    scope: tokenData.scope || null,
    tokenType: tokenData.token_type || 'Bearer',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
}

async function refreshYouTubeAccessToken(connection) {
  if (!connection.refreshTokenEncrypted) throw new Error('Reconnect YouTube to continue importing subscriptions.');
  const { clientId, clientSecret } = youtubeConfig();
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: decryptSecret(connection.refreshTokenEncrypted),
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(data.error_description || 'YouTube access could not be refreshed.');
  return data;
}

export async function validYouTubeAccessToken(db, connection) {
  const stillValid = connection.expiresAt && new Date(connection.expiresAt).getTime() > Date.now() + 60_000;
  if (stillValid) return decryptSecret(connection.accessTokenEncrypted);
  const refreshed = await refreshYouTubeAccessToken(connection);
  const changes = {
    accessTokenEncrypted: encryptSecret(refreshed.access_token),
    expiresAt: refreshed.expires_in ? new Date(Date.now() + Number(refreshed.expires_in) * 1000) : null,
    updatedAt: new Date(),
  };
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
    const response = await fetch(`https://www.googleapis.com/youtube/v3/subscriptions?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || 'YouTube subscriptions could not be imported.');
    for (const item of data.items || []) {
      const snippet = item.snippet || {};
      const resourceId = snippet.resourceId || {};
      if (!resourceId.channelId) continue;
      items.push({
        platform: 'youtube',
        externalProfileId: resourceId.channelId,
        handle: resourceId.channelId,
        displayName: snippet.title || 'YouTube channel',
        profileUrl: `https://www.youtube.com/channel/${resourceId.channelId}`,
        avatarUrl: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || null,
        description: snippet.description || '',
      });
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken && items.length < 1000);

  const now = new Date();
  for (const profile of items) {
    await db.collection('circle_import_candidates').updateOne(
      { userId, platform: profile.platform, externalProfileId: profile.externalProfileId },
      { $set: { ...profile, userId, status: 'pending_review', updatedAt: now }, $setOnInsert: { id: uuidv4(), createdAt: now } },
      { upsert: true },
    );
  }
  await db.collection('circle_connections').updateOne({ id: connection.id, userId }, { $set: { lastImportedAt: now, updatedAt: now } });
  return items.length;
}
