import { getDb } from '@/lib/db';
import { getTrustedLink } from '@/lib/trusted-circle/links';
import { sharePhotos } from '@/lib/sharing/api-service';
import { buildTripShareSuggestions, groupIntoTrips } from '@/lib/trip-sharing';

const TRIP_SCAN_LIMIT = 20_000;

// Only what trip detection needs. aiAnalysis is narrowed to locations and
// faces, which enrichment has already produced — nothing is computed here.
const TRIP_PROJECTION = {
  _id: 0,
  id: 1,
  name: 1,
  kind: 1,
  trashed: 1,
  createdAt: 1,
  capturedAt: 1,
  takenAt: 1,
  mediaCreatedAt: 1,
  uploadedAt: 1,
  'aiAnalysis.locations': 1,
  'aiAnalysis.faces': 1,
};

export class TripSharingError extends Error {
  constructor(message, status = 400, code = 'trip_sharing_invalid') {
    super(message);
    this.name = 'TripSharingError';
    this.status = status;
    this.code = code;
  }
}

async function acceptedTrustedPeople(db, userId) {
  const links = await db.collection('favorites').find({
    status: 'accepted',
    $or: [{ requesterUserId: userId }, { targetUserId: userId }],
  }).toArray();

  const otherIds = [...new Set(links
    .map(link => (link.requesterUserId === userId ? link.targetUserId : link.requesterUserId))
    .filter(Boolean))];
  if (!otherIds.length) return { people: [], linkIdByPerson: {} };

  const users = await db.collection('users')
    .find({ id: { $in: otherIds } })
    .project({ _id: 0, id: 1, name: 1, email: 1, avatarColor: 1 })
    .toArray();

  const linkIdByPerson = {};
  for (const link of links) {
    const otherId = link.requesterUserId === userId ? link.targetUserId : link.requesterUserId;
    if (otherId) linkIdByPerson[otherId] = link.id;
  }
  return { people: users, linkIdByPerson };
}

async function permissionsFor(db, userId, linkIdByPerson) {
  const linkIds = Object.values(linkIdByPerson);
  if (!linkIds.length) return {};
  const records = await db.collection('favorite_permissions')
    .find({ favoriteId: { $in: linkIds }, ownerUserId: userId })
    .toArray();
  const permsByLink = Object.fromEntries(records.map(record => [record.favoriteId, record.perms || {}]));

  const byPerson = {};
  for (const [personId, linkId] of Object.entries(linkIdByPerson)) {
    const stored = permsByLink[linkId];
    // Matches the trusted-circle default: individual photo sharing is allowed
    // once someone is trusted, and can be switched off per person.
    byPerson[personId] = { shareSharedPhotos: stored?.shareSharedPhotos !== false };
  }
  return byPerson;
}

async function sharedMediaIdsFor(db, userId, personIds) {
  if (!personIds.length) return {};
  const rows = await db.collection('shared_photos')
    .find({ ownerUserId: userId, recipientUserId: { $in: personIds } })
    .project({ _id: 0, recipientUserId: 1, mediaId: 1 })
    .toArray();
  const byPerson = {};
  for (const row of rows) {
    if (!byPerson[row.recipientUserId]) byPerson[row.recipientUserId] = [];
    byPerson[row.recipientUserId].push(row.mediaId);
  }
  return byPerson;
}

/** Read-only: returns trip share suggestions awaiting the owner's approval. */
export async function listTripShareSuggestions(user) {
  const db = await getDb();
  const { people, linkIdByPerson } = await acceptedTrustedPeople(db, user.id);
  if (!people.length) return { suggestions: [], trips: [] };

  const [items, permissionsByPerson, sharedMediaIdsByPerson] = await Promise.all([
    db.collection('media')
      .find({ userId: user.id, trashed: { $ne: true } })
      .project(TRIP_PROJECTION)
      .limit(TRIP_SCAN_LIMIT)
      .toArray(),
    permissionsFor(db, user.id, linkIdByPerson),
    sharedMediaIdsFor(db, user.id, people.map(person => person.id)),
  ]);

  const trips = groupIntoTrips(items);
  const suggestions = buildTripShareSuggestions({
    trips,
    trustedPeople: people,
    permissionsByPerson,
    sharedMediaIdsByPerson,
  });

  return {
    suggestions: suggestions.slice(0, 20),
    trips: trips.slice(0, 20).map(({ items: _items, ...trip }) => trip),
  };
}

/**
 * Approves part of a suggestion. The caller must name the recipient and the
 * exact media, so approving is always a deliberate act rather than accepting
 * whatever the suggestion happened to contain.
 */
export async function approveTripShare(user, body = {}) {
  const recipientUserId = String(body?.recipientUserId || '').trim();
  const mediaIds = Array.isArray(body?.mediaIds)
    ? [...new Set(body.mediaIds.map(id => String(id || '').trim()).filter(Boolean))]
    : [];

  if (!recipientUserId) throw new TripSharingError('Choose who to share with.', 400, 'trip_recipient_required');
  if (!mediaIds.length) throw new TripSharingError('Choose at least one photo to share.', 400, 'trip_media_required');
  if (mediaIds.length > 500) throw new TripSharingError('Share up to 500 photos at a time.', 400, 'trip_media_too_many');

  const db = await getDb();
  const link = await getTrustedLink(db, user.id, recipientUserId);
  if (!link) throw new TripSharingError('That person is not in your trusted circle.', 403, 'trip_not_trusted');
  if (link.permsByOwner[user.id]?.shareSharedPhotos !== true) {
    throw new TripSharingError('Photo sharing is turned off for this person.', 403, 'trip_sharing_not_permitted');
  }

  // sharePhotos re-checks ownership and is idempotent, so approving twice
  // cannot double-share.
  return sharePhotos(user, { mediaIds, recipientUserId });
}
