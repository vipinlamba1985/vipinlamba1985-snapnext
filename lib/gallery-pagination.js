import {
  buildSearchPattern,
  cleanMediaDocument,
  MediaLibraryServiceError,
} from './media-library-service.js';

export const DEFAULT_GALLERY_PAGE_SIZE = 60;
export const MAX_GALLERY_PAGE_SIZE = 100;

const GALLERY_FILTERS = new Set(['all', 'photo', 'video', 'favorite', 'places', 'events']);
const SEARCHABLE_FIELDS = [
  'name',
  'userCategory',
  'userTags',
  'people_tags',
  'people',
  'userConfirmedPeople.displayName',
  'aiAnalysis.caption',
  'aiAnalysis.description',
  'aiAnalysis.tags',
  'aiAnalysis.faces',
  'aiAnalysis.people',
  'aiAnalysis.locations',
  'aiAnalysis.emotions',
  'aiAnalysis.autoAlbum',
  'aiAnalysis.contentType',
  'aiAnalysis.textInside',
];
const EVENT_PATTERN = 'birthday|wedding|festival|celebration|trip|holiday|event';

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeGalleryFilter(value) {
  const filter = String(value || 'all').trim().toLowerCase();
  return GALLERY_FILTERS.has(filter) ? filter : 'all';
}

export function clampGalleryPageSize(value, fallback = DEFAULT_GALLERY_PAGE_SIZE) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_GALLERY_PAGE_SIZE, Math.max(20, parsed));
}

export function encodeGalleryCursor(item) {
  const id = String(item?.id || '').trim();
  const uploadedAt = validDate(item?.uploadedAt);
  const createdAt = validDate(item?.createdAt);
  if (!id || (!uploadedAt && !createdAt)) return null;

  return Buffer.from(JSON.stringify({
    u: uploadedAt?.toISOString() || null,
    c: createdAt?.toISOString() || null,
    i: id,
  })).toString('base64url');
}

export function decodeGalleryCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
    const id = String(parsed?.i || '').trim();
    const uploadedAt = validDate(parsed?.u);
    const createdAt = validDate(parsed?.c);
    if (!id || (!uploadedAt && !createdAt)) return null;
    return { id, uploadedAt, createdAt };
  } catch {
    return null;
  }
}

function cursorCondition(cursor) {
  if (!cursor) return null;

  if (cursor.uploadedAt) {
    const sameUpload = cursor.createdAt
      ? [
          { uploadedAt: cursor.uploadedAt, createdAt: { $lt: cursor.createdAt } },
          { uploadedAt: cursor.uploadedAt, createdAt: cursor.createdAt, id: { $lt: cursor.id } },
          { uploadedAt: cursor.uploadedAt, createdAt: null },
        ]
      : [
          { uploadedAt: cursor.uploadedAt, createdAt: null, id: { $lt: cursor.id } },
        ];

    return {
      $or: [
        { uploadedAt: { $lt: cursor.uploadedAt } },
        ...sameUpload,
        // Mongo's equality-to-null semantics include documents where the field
        // is absent, which is exactly the legacy tail after dated uploads.
        { uploadedAt: null },
      ],
    };
  }

  const legacyTail = cursor.createdAt
    ? {
        $or: [
          { createdAt: { $lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { $lt: cursor.id } },
          { createdAt: null },
        ],
      }
    : { createdAt: null, id: { $lt: cursor.id } };

  return { $and: [{ uploadedAt: null }, legacyTail] };
}

function searchCondition(query) {
  const pattern = buildSearchPattern(query);
  if (!pattern) return null;
  return {
    $or: SEARCHABLE_FIELDS.map(field => ({ [field]: { $regex: pattern, $options: 'i' } })),
  };
}

function filterCondition(filter) {
  if (filter === 'places') return { 'aiAnalysis.locations.0': { $exists: true } };
  if (filter === 'events') {
    return {
      $or: [
        { 'aiAnalysis.events.0': { $exists: true } },
        { 'aiAnalysis.tags': { $regex: EVENT_PATTERN, $options: 'i' } },
        { name: { $regex: EVENT_PATTERN, $options: 'i' } },
      ],
    };
  }
  return null;
}

export function buildGalleryQuery({ userId, filter = 'all', query = '', cursor = null } = {}) {
  const normalizedFilter = normalizeGalleryFilter(filter);
  const mongoQuery = {
    userId: String(userId || '').trim(),
    trashed: { $ne: true },
  };

  if (normalizedFilter === 'photo') mongoQuery.kind = 'photo';
  if (normalizedFilter === 'video') mongoQuery.kind = 'video';
  if (normalizedFilter === 'favorite') mongoQuery.favorite = true;

  const conditions = [
    filterCondition(normalizedFilter),
    searchCondition(query),
    cursorCondition(cursor),
  ].filter(Boolean);

  if (conditions.length) mongoQuery.$and = conditions;
  return mongoQuery;
}

export async function listGalleryPage({
  db,
  userId,
  filter = 'all',
  query = '',
  cursor = '',
  limit = DEFAULT_GALLERY_PAGE_SIZE,
}) {
  const decodedCursor = decodeGalleryCursor(cursor);
  if (cursor && !decodedCursor) {
    throw new MediaLibraryServiceError('Library cursor is invalid.', 400, 'media_cursor_invalid');
  }

  const safeLimit = clampGalleryPageSize(limit);
  const docs = await db.collection('media')
    .find(buildGalleryQuery({ userId, filter, query, cursor: decodedCursor }))
    .sort({ uploadedAt: -1, createdAt: -1, id: -1 })
    .limit(safeLimit + 1)
    .toArray();

  const hasMore = docs.length > safeLimit;
  const page = docs.slice(0, safeLimit);
  return {
    items: page.map(cleanMediaDocument),
    hasMore,
    nextCursor: hasMore ? encodeGalleryCursor(page.at(-1)) : null,
    pageSize: safeLimit,
  };
}
