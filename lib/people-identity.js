export const PEOPLE_IDENTITY_PERSON = 'person';
export const PEOPLE_IDENTITY_UNKNOWN = 'unknown';

export function normalizePeopleIdentityState(value) {
  return String(value || '').trim().toLowerCase() === PEOPLE_IDENTITY_UNKNOWN
    ? PEOPLE_IDENTITY_UNKNOWN
    : PEOPLE_IDENTITY_PERSON;
}

export function isUnknownPerson(person = {}) {
  return normalizePeopleIdentityState(person.identityState) === PEOPLE_IDENTITY_UNKNOWN;
}

export function sortPeopleForDisplay(people = [], enabledNames = []) {
  const isEnabled = (name) => Array.isArray(enabledNames)
    ? enabledNames.includes(name)
    : typeof enabledNames?.includes === 'function' && enabledNames.includes(name);
  const bucket = (person) => {
    if (isUnknownPerson(person)) return 3;
    if (isEnabled(person.name)) return 0;
    if (person.verificationStatus === 'suggested') return 1;
    return 2;
  };

  return [...people].sort((a, b) => {
    const bucketDifference = bucket(a) - bucket(b);
    if (bucketDifference) return bucketDifference;
    return Number(b.count || 0) - Number(a.count || 0);
  });
}
