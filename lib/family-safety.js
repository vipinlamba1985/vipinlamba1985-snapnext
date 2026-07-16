export const MINOR_AGE_BANDS = [
  { id: 'under13', min: 0, max: 12, label: 'Under 13', control: 'parent_managed' },
  { id: '13to15', min: 13, max: 15, label: '13–15', control: 'shared_control' },
  { id: '16to17', min: 16, max: 17, label: '16–17', control: 'guided_independence' },
];

export const DEFAULT_MINOR_PERMISSIONS = {
  publicProfile: false,
  publicCommunities: false,
  unknownContacts: false,
  directChat: 'parent_approval',
  communityJoin: 'parent_approval',
  memoryShareOutsideFamily: 'parent_approval',
  faceRecognition: false,
  locationSharing: false,
  behavioralAds: false,
  dataSale: false,
};

export function minorAccountsEnabled() {
  return process.env.MINOR_ACCOUNTS_ENABLED === 'true';
}

export function ageFromBirthDate(value, now = new Date()) {
  const birth = new Date(value);
  if (Number.isNaN(birth.getTime()) || birth > now) return null;
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday = now.getUTCMonth() < birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function ageBandFor(value) {
  const age = typeof value === 'number' ? value : ageFromBirthDate(value);
  return MINOR_AGE_BANDS.find(band => age >= band.min && age <= band.max) || null;
}

export function sanitizeMinorPermissions(input = {}) {
  const permissions = { ...DEFAULT_MINOR_PERMISSIONS };
  for (const key of Object.keys(permissions)) {
    if (typeof permissions[key] === 'boolean') permissions[key] = input[key] === true;
    else if (['parent_approval', 'allowed', 'blocked'].includes(input[key])) permissions[key] = input[key];
  }
  permissions.publicProfile = false;
  permissions.publicCommunities = false;
  permissions.unknownContacts = false;
  permissions.behavioralAds = false;
  permissions.dataSale = false;
  return permissions;
}

export function validConsentRecord(record = {}) {
  return Boolean(record.guardianUserId && record.consentVersion && record.consentedAt && record.method && record.status === 'active');
}

export async function familySafetyForUser(db, userId) {
  const profile = await db.collection('family_minor_profiles').findOne({ userId, status: { $ne: 'deleted' } });
  if (!profile) return { isMinor: false, active: false };
  const consent = await db.collection('family_consent_records').findOne({ minorProfileId: profile.id, status: 'active' }, { sort: { consentedAt: -1 } });
  return {
    isMinor: true,
    active: minorAccountsEnabled() && profile.status === 'active' && validConsentRecord(consent),
    profile,
    consent,
    permissions: sanitizeMinorPermissions(profile.permissions),
  };
}

export async function writeFamilyAudit(db, event) {
  await db.collection('family_safety_audit').insertOne({ ...event, createdAt: new Date() });
}
