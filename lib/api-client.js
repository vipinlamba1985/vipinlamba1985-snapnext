'use client';

const TOKEN_KEY = 'snapnext_token';
const USER_KEY = 'snapnext_user';
const PREVIEW_TOKEN = 'preview-demo-token';

const previewUser = {
  id: 'preview-super-user',
  name: 'Vipin Lamba',
  email: 'vipin.lamba1985@gmail.com',
  role: 'admin',
  plan: 'admin',
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
export function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
export function getStoredUser() {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
}
export function setStoredUser(u) { localStorage.setItem(USER_KEY, JSON.stringify(u)); }
export function isPreviewDemo() { return getToken() === PREVIEW_TOKEN; }
export function logout() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); if (typeof window !== 'undefined') window.location.href = '/login'; }

function previewResponse(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  if (path === '/me' || path === '/user' || path === '/profile' || path === '/auth/me') return { user: previewUser, session: previewUser };
  if (path === '/storage/usage') return { used: 2.4 * 1024 ** 3, limit: 10240 * 1024 ** 3, usedGb: 2.4, limitGb: 10240, plan: 'admin', isSuper: true };
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
  if (path.includes('/upload-url')) return { error: 'Preview mode: real upload disabled for review.' };
  if (path.includes('/billing/checkout')) return { checkoutUrl: '#', isPreview: true };
  if (path.includes('/connections')) return { connections: [], data: [] };
  if (path.includes('/exports')) return { exports: [], data: [] };
  return { ok: true, preview: true };
}

export async function apiFetch(path, options = {}) {
  const token = getToken();

  if (token === PREVIEW_TOKEN) {
    return previewResponse(path, options);
  }

  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { ...options, headers });
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Request failed');
    return data;
  }
  if (!res.ok) throw new Error('Request failed');
  return res;
}

export function mediaSrc(id) {
  const t = getToken();
  if (t === PREVIEW_TOKEN) return '';
  return `/api/media/${id}/file?t=${t}`;
}
