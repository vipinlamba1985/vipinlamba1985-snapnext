import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { encryptCloudToken } from '@/lib/cloud-token-crypto';
import { oauthAdapter } from '@/lib/smart-sync/oauth-adapters';

export const runtime = 'nodejs';

const COOKIE = 'snapnext_smart_sync_oauth';

function json(data, status = 200) { return NextResponse.json(data, { status }); }
function appUrl(request) { return process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin; }
function secret() { return process.env.CLOUD_CONNECTOR_SECRET || ''; }
function sign(value) { return crypto.createHmac('sha256', secret()).update(value).digest('base64url'); }
function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}
function makeState(userId, provider) {
  const payload = Buffer.from(JSON.stringify({ userId, provider, nonce: crypto.randomUUID(), exp: Date.now() + 10 * 60 * 1000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
function readState(value) {
  try {
    const [payload, signature] = String(value || '').split('.');
    if (!payload || !safeEqual(signature, sign(payload))) return null;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return parsed.exp > Date.now() ? parsed : null;
  } catch { return null; }
}
function redirectUri(request, provider) { return `${appUrl(request)}/api/smart-sync/oauth/${provider}/callback`; }
function clearCookie(response) {
  response.cookies.set(COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
  return response;
}
function finish(request, provider, result) {
  return clearCookie(NextResponse.redirect(`${appUrl(request)}/smart-sync?provider=${provider}&oauth=${result}`));
}

export async function GET(request, context) {
  const { provider, action } = await context.params;
  const adapter = oauthAdapter(provider);
  if (!adapter || provider === 'google_drive') return json({ error: 'This provider uses a different connection route.' }, 404);
  const clientId = process.env[adapter.clientIdEnv];
  const clientSecret = process.env[adapter.clientSecretEnv];

  if (action === 'callback') {
    const url = new URL(request.url);
    const returnedState = url.searchParams.get('state') || '';
    const cookieState = request.cookies.get(COOKIE)?.value || '';
    const state = readState(returnedState);
    if (!state || state.provider !== provider || !safeEqual(returnedState, cookieState) || url.searchParams.get('error')) return finish(request, provider, 'cancelled');
    if (!clientId || !clientSecret || !secret()) return finish(request, provider, 'not-configured');

    const tokenResponse = await fetch(adapter.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: url.searchParams.get('code') || '',
        redirect_uri: redirectUri(request, provider),
        grant_type: 'authorization_code',
      }),
    });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok || !token.access_token) return finish(request, provider, 'failed');

    const now = new Date();
    const set = {
      userId: state.userId,
      provider,
      accessToken: encryptCloudToken(token.access_token),
      refreshToken: token.refresh_token ? encryptCloudToken(token.refresh_token) : null,
      expiresAt: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000) : null,
      scope: token.scope || adapter.scopes.join(' '),
      connectedAt: now,
      updatedAt: now,
    };
    await (await getDb()).collection('cloud_connections').updateOne({ userId: state.userId, provider }, { $set: set }, { upsert: true });
    return finish(request, provider, 'connected');
  }

  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Please sign in again.' }, 401);
  const db = await getDb();
  const connection = await db.collection('cloud_connections').findOne({ userId: user.id, provider });

  if (action === 'status') return json({ provider, configured: Boolean(clientId && clientSecret && secret()), connected: Boolean(connection), connectedAt: connection?.connectedAt || null });
  if (action !== 'start') return json({ error: 'Not found.' }, 404);
  if (!clientId || !clientSecret || !secret()) return json({ error: `${provider} connection keys have not been added yet.`, configured: false }, 503);

  const state = makeState(user.id, provider);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(request, provider),
    response_type: 'code',
    scope: adapter.scopes.join(' '),
    state,
  });
  if (provider === 'google_photos') {
    params.set('access_type', 'offline');
    params.set('prompt', 'consent');
  }
  if (provider === 'dropbox') {
    params.set('token_access_type', 'offline');
  }

  const response = json({ authorizationUrl: `${adapter.authorizeUrl}?${params}` });
  response.cookies.set(COOKIE, state, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 10 * 60 });
  return response;
}

export async function DELETE(request, context) {
  const { provider } = await context.params;
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Please sign in again.' }, 401);
  await (await getDb()).collection('cloud_connections').deleteOne({ userId: user.id, provider });
  return json({ ok: true });
}
