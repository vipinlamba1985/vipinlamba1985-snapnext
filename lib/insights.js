// Smart Backup Assistant — derives insights from existing media + favorites.
import { effectivePlan, isFeatureEnabled, isSuperUser, applyStorageSimulation } from '@/lib/entitlements';
import { listAcceptedFavoriteUserIds } from '@/lib/favorites';

const MONTH = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export async function computeInsights(db, user, request) {
  if (!isFeatureEnabled('premiumBackup', request)) {
    return { ok: false, status: 403, error: { code: 'feature_disabled', message: 'Premium Backup is disabled in Developer Test Mode.' } };
  }

  const all = await db.collection('media').find({ userId: user.id, trashed: { $ne: true } }).toArray();
  const totalCount = all.length;
  const totalBytes = all.reduce((s, m) => s + (m.size || 0), 0);

  // --- monthly buckets ---
  const byMonth = {};
  for (const m of all) {
    const d = new Date(m.createdAt);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!byMonth[k]) byMonth[k] = { key: k, label: `${MONTH[d.getMonth()]} ${d.getFullYear()}`, count: 0, bytes: 0 };
    byMonth[k].count++; byMonth[k].bytes += m.size || 0;
  }
  const monthsRanked = Object.values(byMonth).sort((a, b) => b.count - a.count);
  const mostPhotographed = monthsRanked[0] || null;
  const mostActive = monthsRanked[0] || null;

  // --- duplicates (exact, by hash) ---
  const hashGroups = {};
  for (const m of all) {
    if (!m.hash) continue;
    (hashGroups[m.hash] ||= []).push(m);
  }
  const dupGroups = Object.values(hashGroups).filter(g => g.length > 1);
  const dupCount = dupGroups.reduce((s, g) => s + (g.length - 1), 0);
  const dupSavings = dupGroups.reduce((s, g) => s + (g.length - 1) * (g[0].size || 0), 0);

  // --- large videos (>200MB) ---
  const largeVideos = all.filter(m => m.kind === 'video' && (m.size || 0) > 200 * 1024 * 1024).slice(0, 10);
  const largeVideoBytes = largeVideos.reduce((s, m) => s + m.size, 0);

  // --- screenshots (heuristic: name starts with "Screenshot" or contains "screenshot") ---
  const screenshots = all.filter(m => /screen[\s_-]?shot|screenshot/i.test(m.name || ''));

  // --- forecast ---
  const last3 = monthsRanked.slice(0, 12).slice(-3); // not sorted by recency; do better
  const recent = Object.values(byMonth).sort((a, b) => a.key < b.key ? 1 : -1).slice(0, 3);
  const monthlyAvg = recent.length ? recent.reduce((s, m) => s + m.bytes, 0) / recent.length : 0;
  const plan = effectivePlan(user, request);
  const simulatedUsage = applyStorageSimulation({ bytes: totalBytes }, request);
  const effectiveTotalBytes = simulatedUsage.bytes;
  const remaining = isSuperUser(user, request) ? Number.MAX_SAFE_INTEGER : Math.max(0, plan.storageBytes - effectiveTotalBytes);
  const monthsLeft = monthlyAvg > 0 && !isSuperUser(user, request) ? Math.floor(remaining / monthlyAvg) : null;

  // --- sharing opportunities: favorites with whom you've never shared ---
  const favoriteIds = await listAcceptedFavoriteUserIds(db, user.id);
  const sharedRows = await db.collection('shared_photos').find({ ownerUserId: user.id }).project({ recipientUserId: 1 }).toArray();
  const sharedWith = new Set(sharedRows.map(s => s.recipientUserId));
  const neverSharedFavoriteIds = favoriteIds.filter(id => !sharedWith.has(id));
  const neverSharedFavorites = neverSharedFavoriteIds.length
    ? await db.collection('users').find({ id: { $in: neverSharedFavoriteIds } }).project({ id: 1, name: 1, avatarColor: 1 }).toArray()
    : [];

  // --- favorites count (people you've added) ---
  const favoritesCount = favoriteIds.length;

  // --- this month / this year totals ---
  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const thisMonth = byMonth[thisMonthKey] || { count: 0, bytes: 0 };
  const thisYear = Object.values(byMonth).filter(m => m.key.startsWith(`${now.getFullYear()}-`)).reduce((s, m) => s + m.count, 0);

  // --- best memories (recent favorited) ---
  const bestMemories = all.filter(m => m.favorite).slice(0, 8);

  // --- empty albums ---
  const albums = await db.collection('shared_albums').find({ ownerUserId: user.id }).toArray();
  const emptyAlbums = [];
  for (const a of albums) {
    const count = await db.collection('shared_album_media').countDocuments({ albumId: a.id });
    if (count === 0) emptyAlbums.push({ id: a.id, name: a.name });
  }

  // --- usage % ---
  const usagePct = isSuperUser(user, request) ? 0 : Math.min(100, Math.round((effectiveTotalBytes / plan.storageBytes) * 100));

  return {
    totals: { count: totalCount, bytes: totalBytes },
    plan: { id: plan.id, name: plan.name, storageBytes: plan.storageBytes, isSuper: isSuperUser(user, request), simulatedBytes: simulatedUsage.simulated ? effectiveTotalBytes : null },
    mostPhotographed,
    mostActive,
    duplicates: { groups: dupGroups.length, extraCopies: dupCount, savingsBytes: dupSavings },
    largeVideos: { count: largeVideos.length, bytes: largeVideoBytes, items: largeVideos.map(v => ({ id: v.id, name: v.name, size: v.size })) },
    screenshots: { count: screenshots.length, items: screenshots.slice(0, 6).map(s => ({ id: s.id, name: s.name })) },
    forecast: { monthlyAvgBytes: Math.round(monthlyAvg), monthsLeft, usagePct, remainingBytes: remaining === Number.MAX_SAFE_INTEGER ? null : remaining },
    sharing: { favoritesCount, neverSharedFavorites },
    thisMonth: { count: thisMonth.count, label: MONTH[now.getMonth()] + ' ' + now.getFullYear() },
    thisYear: { count: thisYear, label: String(now.getFullYear()) },
    bestMemories: bestMemories.map(b => ({ id: b.id, name: b.name })),
    emptyAlbums,
  };
}
