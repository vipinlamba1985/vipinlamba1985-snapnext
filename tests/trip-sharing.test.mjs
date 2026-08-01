// Trip sharing proposes; the owner disposes. These tests pin the rules that
// keep a suggestion from ever becoming an automatic share.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildTripShareSuggestions,
  groupIntoTrips,
  TRIP_MIN_ITEMS,
} from '../lib/trip-sharing.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(repoRoot, file), 'utf8');

const at = iso => ({ capturedAt: iso });
function tripItems(count, dayIso, extra = {}) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${dayIso}-${index}`,
    ...at(`${dayIso}T${String(9 + index).padStart(2, '0')}:00:00Z`),
    ...extra,
  }));
}

test('photos close together become one trip, distant ones separate trips', () => {
  const trips = groupIntoTrips([
    ...tripItems(6, '2025-04-10'),
    ...tripItems(6, '2025-08-20'),
  ]);
  assert.equal(trips.length, 2);
  // Newest trip first.
  assert.ok(new Date(trips[0].startAt) > new Date(trips[1].startAt));
  assert.equal(trips[0].count, 6);
});

test('a handful of photos is not a trip', () => {
  const trips = groupIntoTrips(tripItems(TRIP_MIN_ITEMS - 1, '2025-04-10'));
  assert.deepEqual(trips, []);
});

test('undated and trashed media never form a trip', () => {
  const trips = groupIntoTrips([
    ...Array.from({ length: 8 }, (_, i) => ({ id: `no-date-${i}` })),
    ...tripItems(8, '2025-04-10', { trashed: true }),
  ]);
  assert.deepEqual(trips, []);
});

test('a known change of place splits a trip', () => {
  // Same day, consecutive blocks of time, so only the place can split them.
  const block = (startHour, place) => Array.from({ length: 5 }, (_, index) => ({
    id: `${place}-${index}`,
    capturedAt: `2025-04-10T${String(startHour + index).padStart(2, '0')}:00:00Z`,
    aiAnalysis: { locations: [place] },
  }));

  const trips = groupIntoTrips([...block(6, 'Paris'), ...block(13, 'Rome')]);
  assert.equal(trips.length, 2);
  assert.deepEqual(new Set(trips.map(trip => trip.place)), new Set(['paris', 'rome']));
  assert.ok(trips.some(trip => trip.title.startsWith('Paris ·')));
});

test('every suggestion is marked as needing approval', () => {
  const trips = groupIntoTrips(tripItems(6, '2025-04-10'));
  const suggestions = buildTripShareSuggestions({
    trips,
    trustedPeople: [{ id: 'friend', name: 'Sam' }],
    permissionsByPerson: { friend: { shareSharedPhotos: true } },
  });
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].requiresApproval, true);
  assert.equal(suggestions[0].recipient.id, 'friend');
  assert.equal(suggestions[0].count, 6);
});

test('nobody outside the trusted circle is ever suggested', () => {
  const trips = groupIntoTrips(tripItems(6, '2025-04-10'));
  assert.deepEqual(
    buildTripShareSuggestions({ trips, trustedPeople: [], permissionsByPerson: { stranger: { shareSharedPhotos: true } } }),
    [],
  );
});

test('photo sharing switched off means no suggestion at all', () => {
  const trips = groupIntoTrips(tripItems(6, '2025-04-10'));
  const people = [{ id: 'friend', name: 'Sam' }];

  assert.deepEqual(
    buildTripShareSuggestions({ trips, trustedPeople: people, permissionsByPerson: { friend: { shareSharedPhotos: false } } }),
    [],
  );
  // Fail closed: an unknown or missing permission is not a yes.
  assert.deepEqual(buildTripShareSuggestions({ trips, trustedPeople: people, permissionsByPerson: {} }), []);
  assert.deepEqual(
    buildTripShareSuggestions({ trips, trustedPeople: people, permissionsByPerson: { friend: {} } }),
    [],
  );
});

test('photos already shared with someone are not offered again', () => {
  const items = tripItems(6, '2025-04-10');
  const trips = groupIntoTrips(items);
  const [suggestion] = buildTripShareSuggestions({
    trips,
    trustedPeople: [{ id: 'friend', name: 'Sam' }],
    permissionsByPerson: { friend: { shareSharedPhotos: true } },
    sharedMediaIdsByPerson: { friend: items.slice(0, 4).map(item => item.id) },
  });
  assert.equal(suggestion.count, 2);
  assert.ok(!suggestion.mediaIds.some(id => items.slice(0, 4).map(i => i.id).includes(id)));
});

test('a fully shared trip disappears rather than suggesting nothing', () => {
  const items = tripItems(6, '2025-04-10');
  assert.deepEqual(
    buildTripShareSuggestions({
      trips: groupIntoTrips(items),
      trustedPeople: [{ id: 'friend', name: 'Sam' }],
      permissionsByPerson: { friend: { shareSharedPhotos: true } },
      sharedMediaIdsByPerson: { friend: items.map(item => item.id) },
    }),
    [],
  );
});

test('someone appearing in the trip ranks above someone who does not', () => {
  const withSam = tripItems(6, '2025-04-10').map(item => ({ ...item, aiAnalysis: { faces: ['Sam'] } }));
  const suggestions = buildTripShareSuggestions({
    trips: groupIntoTrips(withSam),
    trustedPeople: [{ id: 'other', name: 'Alex' }, { id: 'friend', name: 'Sam' }],
    permissionsByPerson: { friend: { shareSharedPhotos: true }, other: { shareSharedPhotos: true } },
  });
  assert.equal(suggestions[0].recipient.name, 'Sam');
  assert.equal(suggestions[0].appearsInTrip, true);
  assert.match(suggestions[0].reason, /appear in photos/);
  assert.equal(suggestions[1].appearsInTrip, false);
});

test('the suggestion builder is pure and shares nothing', async () => {
  const source = await read(path.join('lib', 'trip-sharing.js'));
  // No database, no network, no AI: suggestions cost nothing to produce.
  assert.doesNotMatch(source, /^import /m);
  assert.doesNotMatch(source, /collection\(|fetch\(|sharePhotos/);
});

test('approval is a deliberate act, re-checked on the server', async () => {
  const service = await read(path.join('lib', 'trip-sharing-service.js'));
  // The caller must name both the recipient and the exact media.
  assert.match(service, /trip_recipient_required/);
  assert.match(service, /trip_media_required/);
  // Trust and permission are both re-verified at approval time, not trusted
  // from whatever the client posted back.
  assert.match(service, /getTrustedLink/);
  assert.match(service, /trip_not_trusted/);
  assert.match(service, /shareSharedPhotos !== true/);
  assert.match(service, /trip_sharing_not_permitted/);
});

test('the trip-sharing route shares only on POST and requires a session', async () => {
  const route = await read(path.join('app', 'api', 'trip-sharing', 'route.js'));
  const get = route.slice(route.indexOf('export async function GET'), route.indexOf('export async function POST'));
  assert.doesNotMatch(get, /approveTripShare/, 'GET must never share');
  assert.match(get, /listTripShareSuggestions/);
  assert.equal((route.match(/await getUserFromRequest\(request\)/g) || []).length, 2, 'both handlers authenticate');
  assert.equal((route.match(/auth_unauthorized/g) || []).length, 2);
});
