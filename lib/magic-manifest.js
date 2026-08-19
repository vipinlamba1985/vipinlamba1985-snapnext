export const MAGIC_BLUEPRINT_VERSION = 'magic-v1';
export const MAGIC_CARD_MIN_ASSETS_DEFAULT = 5;
export const MIN_MAGIC_CARDS_DEFAULT = 3;

export const MAGIC_REASON_CODES = Object.freeze({
  PENDING: 'PENDING',
  ELIGIBLE: 'ELIGIBLE',
  BROKEN_MEDIA: 'BROKEN_MEDIA',
  SCREENSHOT: 'SCREENSHOT',
  DOCUMENT: 'DOCUMENT',
  RECEIPT: 'RECEIPT',
  LOW_QUALITY: 'LOW_QUALITY',
  DUPLICATE: 'DUPLICATE',
  UNSUPPORTED_MEDIA: 'UNSUPPORTED_MEDIA',
  MISSING_METADATA: 'MISSING_METADATA',
  USER_HIDDEN: 'USER_HIDDEN',
  PRIVACY_RESTRICTED: 'PRIVACY_RESTRICTED',
  FACE_CONSENT_REQUIRED: 'FACE_CONSENT_REQUIRED',
  UNCONFIRMED_PERSON: 'UNCONFIRMED_PERSON',
  LOW_CLUSTER_CONFIDENCE: 'LOW_CLUSTER_CONFIDENCE',
});

// V1 intentionally does not emit recently-added cards. Keep the type reserved
// so the manifest schema does not need to change if product telemetry later
// justifies a cold-start fallback.
export const MAGIC_CARD_TYPES = Object.freeze({
  TIME_PERIOD: 'time_period',
  FAVORITES: 'favorites',
  VIDEOS: 'videos',
  RECENTLY_ADDED: 'recently_added',
  FACE_CLUSTER: 'face_cluster',
  NARRATIVE: 'narrative',
});

export const SCREENSHOT_FILENAME_SOURCE = String.raw`(^|[\s_.-])(screenshot|screen[\s_-]?shot|screen[\s_-]?recording|capture|snip)([\s_.-]|$)`;
export const SCREENSHOT_FILENAME_REGEX = new RegExp(SCREENSHOT_FILENAME_SOURCE, 'i');

function finiteTime(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function strictCaptureTime(item = {}) {
  return finiteTime(item.capturedAt)
    ?? finiteTime(item.takenAt)
    ?? finiteTime(item.mediaCreatedAt)
    ?? null;
}

// Determinism policy locked for Favorites and Videos:
// capturedAt/takenAt/mediaCreatedAt first, uploadedAt second, then id ASC.
export function cardSortTime(item = {}) {
  return strictCaptureTime(item)
    ?? finiteTime(item.uploadedAt)
    ?? 0;
}

export function compareCardAssets(a = {}, b = {}) {
  const delta = cardSortTime(b) - cardSortTime(a);
  if (delta !== 0) return delta;
  return String(a.id || '').localeCompare(String(b.id || ''));
}

export function compareStrictCaptureAssets(a = {}, b = {}) {
  const delta = (strictCaptureTime(b) ?? 0) - (strictCaptureTime(a) ?? 0);
  if (delta !== 0) return delta;
  return String(a.id || '').localeCompare(String(b.id || ''));
}

export function isDeterministicScreenshot(item = {}) {
  const userCategory = String(item.userCategory || '').trim().toLowerCase();
  if (userCategory === 'screenshots') return true;
  const source = String(item.screenshotTypeSource || '').trim().toLowerCase();
  if (source === 'user' && (item.userScreenshotType || item.screenshotType)) return true;
  return SCREENSHOT_FILENAME_REGEX.test(String(item.name || '').trim());
}

export function deriveMagicEligibility(item = {}) {
  if (!item?.id) return { eligible: false, reasonCode: MAGIC_REASON_CODES.BROKEN_MEDIA };
  if (item.trashed === true) return { eligible: false, reasonCode: MAGIC_REASON_CODES.USER_HIDDEN };
  if (item.kind === 'text' || item.kind === 'document') {
    return { eligible: false, reasonCode: MAGIC_REASON_CODES.DOCUMENT };
  }
  if (!['photo', 'video'].includes(String(item.kind || ''))) {
    return { eligible: false, reasonCode: MAGIC_REASON_CODES.UNSUPPORTED_MEDIA };
  }
  if (isDeterministicScreenshot(item)) {
    return { eligible: false, reasonCode: MAGIC_REASON_CODES.SCREENSHOT };
  }
  return { eligible: true, reasonCode: MAGIC_REASON_CODES.ELIGIBLE };
}

export function pendingMagicEligibilityFields(now = new Date()) {
  return {
    magic_eligible: null,
    magic_reason_code: MAGIC_REASON_CODES.PENDING,
    magic_blueprint_version: MAGIC_BLUEPRINT_VERSION,
    magic_eligibility_updated_at: now,
  };
}

export function eligibilityFieldsForItem(item = {}, now = new Date()) {
  const decision = deriveMagicEligibility(item);
  return {
    magic_eligible: decision.eligible,
    magic_reason_code: decision.reasonCode,
    magic_blueprint_version: MAGIC_BLUEPRINT_VERSION,
    magic_eligibility_updated_at: now,
  };
}

function monthKeyFromTime(time) {
  const date = new Date(time);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthTitle(key) {
  const [year, month] = String(key).split('-').map(Number);
  const date = new Date(Date.UTC(year, Math.max(0, month - 1), 1));
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function cardFromItems({
  type,
  cardKey,
  title,
  subtitle,
  items,
  minAssets,
  priority,
  period = null,
  usedCoverIds,
}) {
  if (!Array.isArray(items) || items.length < minAssets) return null;
  const uniqueItems = [];
  const seen = new Set();
  for (const item of items) {
    const id = String(item?.id || '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    uniqueItems.push(item);
  }
  if (uniqueItems.length < minAssets) return null;

  // The global presentation budget is cover-only. Assets may belong to more
  // than one logical collection, but the same image never fronts two cards in
  // one manifest generation.
  const cover = uniqueItems.find(item => !usedCoverIds.has(String(item.id)));
  if (!cover) return null;
  usedCoverIds.add(String(cover.id));

  const assetIds = uniqueItems.slice(0, 24).map(item => String(item.id));
  if (!assetIds.includes(String(cover.id))) assetIds.unshift(String(cover.id));

  return {
    card_id: cardKey,
    card_key: cardKey,
    tier: 'T1',
    type,
    title,
    subtitle,
    asset_ids: assetIds.slice(0, 24),
    asset_count: uniqueItems.length,
    cover_asset_id: String(cover.id),
    people_ids: [],
    requires_face_consent: false,
    generation_source: 'metadata',
    confidence: 1,
    expires_at: null,
    min_assets: minAssets,
    priority,
    period,
  };
}

export function buildMagicCards(items = [], { minAssets = MAGIC_CARD_MIN_ASSETS_DEFAULT } = {}) {
  const eligible = (Array.isArray(items) ? items : []).filter(item => item?.magic_eligible === true);
  const usedCoverIds = new Set();
  const cards = [];

  const byMonth = new Map();
  for (const item of eligible) {
    const captured = strictCaptureTime(item);
    if (captured === null) continue;
    const key = monthKeyFromTime(captured);
    const bucket = byMonth.get(key) || [];
    bucket.push(item);
    byMonth.set(key, bucket);
  }

  for (const [key, bucket] of [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {
    const ordered = [...bucket].sort(compareStrictCaptureAssets);
    const card = cardFromItems({
      type: MAGIC_CARD_TYPES.TIME_PERIOD,
      cardKey: `time:${key}`,
      title: monthTitle(key),
      subtitle: `${ordered.length} ${ordered.length === 1 ? 'memory' : 'memories'}`,
      items: ordered,
      minAssets,
      priority: 300,
      period: key,
      usedCoverIds,
    });
    if (card) cards.push(card);
  }

  const favorites = eligible
    .filter(item => Boolean(item.favorite || item.isFavorite))
    .sort(compareCardAssets);
  const favoriteCard = cardFromItems({
    type: MAGIC_CARD_TYPES.FAVORITES,
    cardKey: 'favorites',
    title: 'Favorites',
    subtitle: `${favorites.length} saved ${favorites.length === 1 ? 'memory' : 'memories'}`,
    items: favorites,
    minAssets,
    priority: 200,
    usedCoverIds,
  });
  if (favoriteCard) cards.push(favoriteCard);

  const videos = eligible
    .filter(item => item.kind === 'video')
    .sort(compareCardAssets);
  const videoCard = cardFromItems({
    type: MAGIC_CARD_TYPES.VIDEOS,
    cardKey: 'videos',
    title: 'Videos',
    subtitle: `${videos.length} ${videos.length === 1 ? 'video' : 'videos'}`,
    items: videos,
    minAssets,
    priority: 100,
    usedCoverIds,
  });
  if (videoCard) cards.push(videoCard);

  return cards.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if ((a.period || '') !== (b.period || '')) return String(b.period || '').localeCompare(String(a.period || ''));
    return String(a.card_key).localeCompare(String(b.card_key));
  });
}

function parseExpiry(value) {
  const time = finiteTime(value);
  return time === null ? null : time;
}

export function filterManifestForDelivery({
  manifest = null,
  existingAssetIds = new Set(),
  faceCardsAllowed = false,
  now = new Date(),
  minMagicCards = MIN_MAGIC_CARDS_DEFAULT,
} = {}) {
  if (!manifest) {
    return {
      availability: 'starter',
      reason: 'manifest_pending',
      manifest: null,
      cards: [],
    };
  }

  const nowMs = new Date(now).getTime();
  const visibleCards = [];
  for (const sourceCard of Array.isArray(manifest.cards) ? manifest.cards : []) {
    const card = { ...sourceCard };
    const tier = String(card.tier || 'T1').toUpperCase();

    if (tier !== 'T1') {
      const expiresAt = parseExpiry(card.expires_at);
      if (expiresAt !== null && expiresAt <= nowMs) continue;
    }
    if (card.requires_face_consent === true && !faceCardsAllowed) continue;

    const coverId = String(card.cover_asset_id || '');
    if (!coverId || !existingAssetIds.has(coverId)) continue;

    const memberIds = (Array.isArray(card.asset_ids) ? card.asset_ids : [])
      .map(value => String(value || ''))
      .filter(Boolean)
      .filter(id => existingAssetIds.has(id));
    const minAssets = Math.max(1, Number(card.min_assets) || MAGIC_CARD_MIN_ASSETS_DEFAULT);
    if (memberIds.length < minAssets) continue;

    card.asset_ids = memberIds;
    card.asset_count_visible = memberIds.length;
    visibleCards.push(card);
  }

  const floor = Math.max(1, Number(minMagicCards) || MIN_MAGIC_CARDS_DEFAULT);
  return {
    availability: visibleCards.length >= floor ? 'ready' : 'starter',
    reason: visibleCards.length >= floor ? null : 'below_card_floor',
    manifest: {
      manifest_id: manifest.manifest_id,
      user_id: manifest.user_id,
      blueprint_version: manifest.blueprint_version,
      generated_at: manifest.generated_at,
      generation_reason: manifest.generation_reason,
      source_revision: manifest.source_revision,
      generation_stats: manifest.generation_stats || {},
    },
    cards: visibleCards,
  };
}

export function buildMagicCoveragePipeline() {
  return [
    { $match: { trashed: { $ne: true }, kind: { $in: ['photo', 'video'] } } },
    {
      $project: {
        userId: 1,
        hasTrustworthyCapture: {
          $or: [
            { $ne: [{ $ifNull: ['$capturedAt', null] }, null] },
            { $ne: [{ $ifNull: ['$takenAt', null] }, null] },
            { $ne: [{ $ifNull: ['$mediaCreatedAt', null] }, null] },
          ],
        },
        deterministicScreenshot: {
          $or: [
            { $eq: [{ $toLower: { $ifNull: ['$userCategory', ''] } }, 'screenshots'] },
            {
              $and: [
                { $eq: [{ $toLower: { $ifNull: ['$screenshotTypeSource', ''] } }, 'user'] },
                { $ne: [{ $ifNull: ['$userScreenshotType', ''] }, ''] },
              ],
            },
            {
              $regexMatch: {
                input: { $ifNull: ['$name', ''] },
                regex: SCREENSHOT_FILENAME_SOURCE,
                options: 'i',
              },
            },
          ],
        },
      },
    },
    {
      $facet: {
        overall: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              trustworthyCapture: { $sum: { $cond: ['$hasTrustworthyCapture', 1, 0] } },
              deterministicScreenshotMatches: { $sum: { $cond: ['$deterministicScreenshot', 1, 0] } },
            },
          },
          {
            $project: {
              _id: 0,
              total: 1,
              trustworthyCapture: 1,
              captureCoveragePct: {
                $cond: [
                  { $gt: ['$total', 0] },
                  { $multiply: [{ $divide: ['$trustworthyCapture', '$total'] }, 100] },
                  0,
                ],
              },
              deterministicScreenshotMatches: 1,
            },
          },
        ],
        perUser: [
          {
            $group: {
              _id: '$userId',
              total: { $sum: 1 },
              trustworthyCapture: { $sum: { $cond: ['$hasTrustworthyCapture', 1, 0] } },
              deterministicScreenshotMatches: { $sum: { $cond: ['$deterministicScreenshot', 1, 0] } },
            },
          },
          {
            $project: {
              _id: 0,
              userId: '$_id',
              total: 1,
              trustworthyCapture: 1,
              captureCoveragePct: {
                $cond: [
                  { $gt: ['$total', 0] },
                  { $multiply: [{ $divide: ['$trustworthyCapture', '$total'] }, 100] },
                  0,
                ],
              },
              deterministicScreenshotMatches: 1,
            },
          },
          { $sort: { captureCoveragePct: 1, userId: 1 } },
        ],
      },
    },
  ];
}
