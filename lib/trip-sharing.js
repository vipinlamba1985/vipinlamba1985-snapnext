// Trip sharing — proposing, never performing.
//
// Two people already in each other's trusted circle often come home from the
// same trip with photos of each other. This module finds those trips from
// capture metadata and drafts a suggestion. It writes nothing, shares nothing,
// and every suggestion it produces is marked as requiring approval: the owner
// picks the photos and confirms before anything leaves their library.
//
// Trip detection is pure metadata (capture time, and location when it is
// already present). Face names are used only to rank a suggestion when
// enrichment has already run — they are never computed here, so a suggestion
// costs nothing to produce.

const HOUR_MS = 60 * 60 * 1000;

export const TRIP_GAP_HOURS = 20;
export const TRIP_MIN_ITEMS = 5;

function captureDate(item) {
  const raw = item?.capturedAt || item?.takenAt || item?.mediaCreatedAt || item?.createdAt || item?.uploadedAt;
  const date = raw ? new Date(raw) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function primaryLocation(item) {
  const locations = item?.aiAnalysis?.locations;
  if (!Array.isArray(locations)) return '';
  const first = locations.find(Boolean);
  return first ? String(first).trim().toLowerCase() : '';
}

function faceNames(item) {
  const faces = item?.aiAnalysis?.faces;
  if (!Array.isArray(faces)) return [];
  return faces.filter(Boolean).map(face => String(face).trim().toLowerCase()).filter(Boolean);
}

function dateRangeLabel(start, end) {
  const sameDay = start.toDateString() === end.toDateString();
  const day = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' });
  return sameDay ? day.format(start) : `${new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(start)} – ${day.format(end)}`;
}

/**
 * Groups media into trips: runs of photos taken close together in time. A gap
 * longer than `gapHours`, or a change of known location, starts a new trip.
 * Undated and trashed media are ignored rather than guessed at.
 */
export function groupIntoTrips(items = [], { gapHours = TRIP_GAP_HOURS, minItems = TRIP_MIN_ITEMS } = {}) {
  const dated = (Array.isArray(items) ? items : [])
    .filter(item => item && !item.trashed && captureDate(item))
    .map(item => ({ item, at: captureDate(item), place: primaryLocation(item) }))
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  const runs = [];
  let current = null;
  for (const entry of dated) {
    const brokeByTime = current && entry.at.getTime() - current.lastAt.getTime() > gapHours * HOUR_MS;
    // Only treat a location change as a boundary when both sides are known.
    const brokeByPlace = current && current.place && entry.place && current.place !== entry.place;
    if (!current || brokeByTime || brokeByPlace) {
      current = { entries: [entry], place: entry.place, firstAt: entry.at, lastAt: entry.at };
      runs.push(current);
      continue;
    }
    current.entries.push(entry);
    current.lastAt = entry.at;
    if (!current.place && entry.place) current.place = entry.place;
  }

  return runs
    .filter(run => run.entries.length >= minItems)
    .map(run => {
      const tripItems = run.entries.map(entry => entry.item);
      const places = [...new Set(run.entries.map(entry => entry.place).filter(Boolean))];
      const people = [...new Set(tripItems.flatMap(faceNames))];
      return {
        id: `trip-${run.firstAt.toISOString().slice(0, 10)}-${tripItems.length}`,
        title: places[0] ? `${places[0].replace(/\b\w/g, c => c.toUpperCase())} · ${dateRangeLabel(run.firstAt, run.lastAt)}` : dateRangeLabel(run.firstAt, run.lastAt),
        startAt: run.firstAt.toISOString(),
        endAt: run.lastAt.toISOString(),
        place: places[0] || '',
        items: tripItems,
        count: tripItems.length,
        people,
      };
    })
    .sort((a, b) => new Date(b.startAt) - new Date(a.startAt));
}

/**
 * Drafts share suggestions for trips.
 *
 * A suggestion is only ever produced when all of these hold:
 *   - the recipient is an accepted member of the owner's trusted circle,
 *   - the owner's shareSharedPhotos permission for that person is on,
 *   - there is at least one trip photo not already shared with them.
 *
 * Every result carries requiresApproval: true. This function never shares.
 */
export function buildTripShareSuggestions({
  trips = [],
  trustedPeople = [],
  permissionsByPerson = {},
  sharedMediaIdsByPerson = {},
} = {}) {
  const suggestions = [];

  for (const person of trustedPeople) {
    const personId = person?.id;
    if (!personId) continue;
    // Fail closed: absent permissions mean no suggestion, not a default yes.
    if (permissionsByPerson[personId]?.shareSharedPhotos !== true) continue;

    const alreadyShared = new Set(sharedMediaIdsByPerson[personId] || []);
    const personName = String(person.name || '').trim().toLowerCase();

    for (const trip of trips) {
      const candidates = trip.items.filter(item => !alreadyShared.has(item.id));
      if (!candidates.length) continue;

      const appearsInTrip = Boolean(personName) && trip.people.includes(personName);
      suggestions.push({
        id: `${trip.id}:${personId}`,
        tripId: trip.id,
        tripTitle: trip.title,
        startAt: trip.startAt,
        endAt: trip.endAt,
        place: trip.place,
        recipient: { id: personId, name: person.name || 'Trusted person', email: person.email || '' },
        mediaIds: candidates.map(item => item.id),
        count: candidates.length,
        // Why this was suggested, in the user's terms.
        reason: appearsInTrip
          ? `${person.name || 'They'} appear in photos from this trip`
          : 'From a trip you have not shared with them yet',
        appearsInTrip,
        requiresApproval: true,
      });
    }
  }

  // Strongest signal first: people actually in the photos, then bigger trips.
  return suggestions.sort((a, b) => {
    if (a.appearsInTrip !== b.appearsInTrip) return a.appearsInTrip ? -1 : 1;
    if (b.count !== a.count) return b.count - a.count;
    return new Date(b.startAt) - new Date(a.startAt);
  });
}
