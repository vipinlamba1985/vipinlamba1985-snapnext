export const MAX_USER_CONFIRMED_PEOPLE = 4;

const INVALID_PERSON_STATUSES = new Set(['hidden', 'rejected', 'legacy']);
const GENERIC_PERSON_NAMES = new Set(['', 'add name', 'person', 'people', 'unknown', 'face', 'user']);

export class UserConfirmedPeopleError extends Error {
  constructor(message, code = 'person_assignment_invalid', status = 400) {
    super(message);
    this.name = 'UserConfirmedPeopleError';
    this.code = code;
    this.status = status;
  }
}

export function parseAssignedPersonClusterIds(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new UserConfirmedPeopleError('People assignments must be a list.', 'person_assignment_shape_invalid');
  }

  const ids = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      throw new UserConfirmedPeopleError('People assignments must contain person IDs.', 'person_assignment_id_invalid');
    }
    const id = entry.trim();
    if (!id || id.length > 120 || /[\u0000-\u001f\u007f]/.test(id)) {
      throw new UserConfirmedPeopleError('A selected person is invalid.', 'person_assignment_id_invalid');
    }
    if (!ids.includes(id)) ids.push(id);
  }

  if (ids.length > MAX_USER_CONFIRMED_PEOPLE) {
    throw new UserConfirmedPeopleError(
      `Choose up to ${MAX_USER_CONFIRMED_PEOPLE} people for one upload.`,
      'person_assignment_limit',
    );
  }
  return ids;
}

function safeDisplayName(person = {}) {
  if (person.isSelf) return 'You';
  const value = String(person.displayName || '').trim().slice(0, 80);
  return GENERIC_PERSON_NAMES.has(value.toLowerCase()) ? 'This person' : value;
}

export async function loadActivatedPersonAssignments({ db, userId, clusterIds = [] }) {
  const requested = [...new Set(clusterIds.map((value) => String(value || '').trim()).filter(Boolean))];
  if (!requested.length) return new Map();

  const [activation, people] = await Promise.all([
    db.collection('magic_library_activation').findOne({ userId }),
    db.collection('person_clusters').find({
      userId,
      clusterId: { $in: requested },
      status: { $nin: [...INVALID_PERSON_STATUSES] },
      identityState: { $ne: 'unknown' },
    }).project({ clusterId: 1, displayName: 1, isSelf: 1, status: 1, identityState: 1 }).toArray(),
  ]);

  const active = new Set(Array.isArray(activation?.active) ? activation.active : []);
  const byId = new Map(people.map((person) => [String(person.clusterId), person]));
  const resolved = new Map();

  for (const clusterId of requested) {
    const person = byId.get(clusterId);
    if (!active.has(clusterId) || !person || INVALID_PERSON_STATUSES.has(person.status) || person.identityState === 'unknown') {
      throw new UserConfirmedPeopleError(
        'Choose an active person from your Magic Library.',
        'person_assignment_not_active',
      );
    }
    resolved.set(clusterId, { clusterId, displayName: safeDisplayName(person) });
  }

  return resolved;
}

export function confirmedPersonIds(item = {}) {
  return [...new Set((Array.isArray(item.userConfirmedPeople) ? item.userConfirmedPeople : [])
    .map((entry) => String(entry?.clusterId || '').trim())
    .filter(Boolean))];
}

export function personMembershipQuery(userId, clusterId) {
  return {
    userId,
    trashed: { $ne: true },
    $or: [
      { 'peopleIntelligence.clusterIds': clusterId },
      { 'userConfirmedPeople.clusterId': clusterId },
    ],
  };
}
