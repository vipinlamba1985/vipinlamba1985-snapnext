'use client';

import { supabase } from './supabase';

const TOKEN_KEY = 'snapnext_token';
const REFRESH_TOKEN_KEY = 'snapnext_refresh_token';
const EXPIRES_AT_KEY = 'snapnext_expires_at';
const USER_KEY = 'snapnext_user';
const PREVIEW_TOKEN = 'preview-demo-token';

const previewUser = {
  id: 'preview-super-user',
  name: 'Vipin Lamba',
  email: 'vipin.lamba1985@gmail.com',
  role: 'admin',
  plan: 'super_user',
  storageUsed: 2.4,
  storageLimit: 10240,
  isPreview: true,
};

const previewMedia = [
  { id: 'demo-1', kind: 'photo', name: 'Family memory', size: 2400000, createdAt: new Date().toISOString(), url: '', isFavorite: true },
  { id: 'demo-2', kind: 'photo', name: 'Travel moment', size: 3200000, createdAt: new Date().toISOString(), url: '', isFavorite: false },
  { id: 'demo-3', kind: 'video', name: 'Short video', size: 14000000, createdAt: new Date().toISOString(), url: '', isFavorite: false },
];

export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t, refreshToken, expiresAt) {
  if (typeof window === 'undefined') return;
  if (t) {
    localStorage.setItem(TOKEN_KEY, t);
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `sb-access-token=${encodeURIComponent(t)}; path=/; max-age=604800; SameSite=Lax${secure}`;
  }
  if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  if (expiresAt) localStorage.setItem(EXPIRES_AT_KEY, String(expiresAt));
}
export function getRefreshToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}
export function getStoredUser() {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
}
export function setStoredUser(u) { localStorage.setItem(USER_KEY, JSON.stringify(u)); }
export function isPreviewDemo() { return getToken() === PREVIEW_TOKEN; }
export function logout() {
  const token = getToken();
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(EXPIRES_AT_KEY);
  localStorage.removeItem(USER_KEY);
  document.cookie = 'sb-access-token=; path=/; max-age=0; SameSite=Lax';
  if (token && token !== PREVIEW_TOKEN) {
    fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  }
  if (supabase) {
    supabase.auth.signOut().catch(() => {});
  }
  if (typeof window !== 'undefined') window.location.href = '/login';
}

async function refreshAuthSession() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.token) throw new Error(data?.error || 'Please sign in again to continue.');
  setToken(data.token, data.refreshToken, data.expiresAt);
  if (data.user) setStoredUser(data.user);
  return data.token;
}

function previewResponse(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  if (path === '/me' || path === '/user' || path === '/profile' || path === '/auth/me') return { user: previewUser, session: previewUser };
  if (path === '/storage/usage') return {
    usage: { used: 2.4 * 1024 ** 3, limit: 10240 * 1024 ** 3, usedGb: 2.4, limitGb: 10240 },
    used: 2.4 * 1024 ** 3,
    limit: 10240 * 1024 ** 3,
    usedGb: 2.4,
    limitGb: 10240,
    plan: { id: 'super_user', name: 'Super User', storageBytes: null, aiPerDay: null },
    rawPlan: 'super_user',
    role: 'admin',
    effectivePlan: 'super_user',
    isSuper: true,
    aiUsedToday: 0,
  };
  if (path === '/media') return { items: previewMedia, media: previewMedia, data: previewMedia };
  if (path === '/memories') return { items: [], today: [], onThisDay: [], count: 0 };
  if (path === '/insights') return {
    totals: { count: previewMedia.length, bytes: previewMedia.reduce((s, m) => s + m.size, 0) },
    mostPhotographed: { label: 'June 2026', count: 3 },
    thisMonth: { label: 'June 2026', count: 3 },
    thisYear: { label: '2026', count: 3 },
    duplicates: { extraCopies: 0, savingsBytes: 0 },
    largeVideos: { count: 0, bytes: 0 },
    sharing: { neverSharedFavorites: [] },
    forecast: { monthsLeft: null },
    plan: { name: 'Super User', isSuper: true },
  };
  if (path === '/insights/ai-summary' && method === 'POST') return { highlights: ['Your memories are safely organized.', 'AI captions are ready for your next post.', 'No duplicate cleanup needed right now.'] };
  if (path.includes('/upload-url')) return { error: 'Uploads are unavailable in preview mode.' };
  if (path.includes('/billing/checkout')) return { checkoutUrl: '#', isPreview: true };
  if (path.includes('/connections')) return { connections: [], data: [] };
  if (path.includes('/exports')) return { exports: [], data: [] };
  return { ok: true, preview: true };
}

export function friendlyMessage(error, status = 0) {
  const raw = typeof error === 'string' ? error : error?.message || '';
  const code = typeof error === 'object' ? String(error?.code || '').toLowerCase() : '';
  const text = `${code} ${raw}`.toLowerCase();

  if (status === 401 || text.includes('unauthorized') || text.includes('unauthenticated') || text.includes('session expired')) return 'Please sign in again to continue.';
  if (status === 403 || text.includes('forbidden') || text.includes('feature_not_available')) return 'This feature is not included in your current plan.';
  if (status === 404 || text.includes('not found')) return 'We could not find that item. It may have been moved or deleted.';
  if (status === 413 || text.includes('too large') || text.includes('request_too_large')) return 'This file is too large. Please choose a smaller one.';
  if (status === 415 || text.includes('unsupported') || text.includes('file type')) return 'This file type is not supported yet.';
  if (status === 429 || text.includes('rate_limited') || text.includes('too many')) return 'You are creating a lot right now. Please give us a moment and try again.';
  if (text.includes('daily limit')) return 'You have used today’s AI creations. More will be available tomorrow.';
  if (text.includes('monthly') || text.includes('billing period') || text.includes('quota') || text.includes('credits remaining')) return 'You have used this period’s AI creations. Your balance will refresh automatically.';
  if (text.includes('provider_not_configured') || text.includes('not configured') || text.includes('being activated')) return 'This creation option is coming soon. Everything else in SnapNext still works normally.';
  if (text.includes('provider') || text.includes('timeout') || text.includes('temporarily unavailable') || text.includes('service unavailable')) return 'We could not finish this right now. Please try again in a moment.';
  if (status >= 500 || text.includes('internal error') || text.includes('request failed')) return 'Something did not go as planned. Please try again in a moment.';
  return raw || 'Something did not go as planned. Please try again.';
}

export async function apiFetch(path, options = {}) {
  let token = getToken();

  if (token === PREVIEW_TOKEN) {
    const passThrough = path.startsWith('/ai/') || path.startsWith('/dev/') || path === '/auth/me' || path === '/storage/usage' || path === '/insights' || path === '/ai/status';
    if (!passThrough) return previewResponse(path, options);
  }

  async function doFetch(authToken) {
    const headers = { ...(options.headers || {}) };
    if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    return fetch(`/api${path}`, { ...options, headers });
  }

  let res = await doFetch(token);
  if (res.status === 401 && path !== '/auth/refresh') {
    try {
      token = await refreshAuthSession();
      res = await doFetch(token);
    } catch {
      logout();
      throw new Error('Please sign in again to continue.');
    }
  }

  const requestId = res.headers.get('x-request-id') || undefined;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const data = await res.json();
    if (!res.ok) {
      const err = data?.error;
      const error = new Error(friendlyMessage(err || data, res.status));
      error.status = res.status;
      error.code = data?.code || (typeof err === 'object' ? err?.code : undefined);
      error.requestId = requestId;
      error.details = data;
      throw error;
    }
    return data;
  }
  if (!res.ok) {
    const error = new Error(friendlyMessage('', res.status));
    error.status = res.status;
    error.requestId = requestId;
    throw error;
  }
  return res;
}

export function mediaSrc(id) {
  const t = getToken();
  if (t === PREVIEW_TOKEN) return '';
  return `/api/media/${encodeURIComponent(id)}/file`;
}
