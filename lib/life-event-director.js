const DAY_MS = 24 * 60 * 60 * 1000;

export const EVENT_TYPES = ['birthday', 'anniversary', 'festival', 'national-day', 'tradition', 'milestone', 'trip', 'other'];
export const CONTENT_FORMATS = ['reel', 'video', 'collage', 'image-post', 'story', 'whatsapp-status', 'greeting-card'];

export function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function nextAnnualOccurrence(value, now = new Date()) {
  const source = normalizeDate(value);
  if (!source) return null;
  const next = new Date(now.getFullYear(), source.getMonth(), source.getDate(), 9, 0, 0, 0);
  if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) next.setFullYear(next.getFullYear() + 1);
  return next;
}

export function daysUntil(date, now = new Date()) {
  const target = normalizeDate(date);
  if (!target) return null;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((end - start) / DAY_MS);
}

export function profileCompleteness(profile = {}) {
  const required = ['name', 'relationship', 'birthday'];
  const recommended = ['photoId', 'anniversary', 'originCountries', 'currentCountry', 'celebrations'];
  const missingRequired = required.filter(key => !profile[key] || (Array.isArray(profile[key]) && !profile[key].length));
  const missingRecommended = recommended.filter(key => !profile[key] || (Array.isArray(profile[key]) && !profile[key].length));
  const total = required.length * 2 + recommended.length;
  const completed = (required.length - missingRequired.length) * 2 + (recommended.length - missingRecommended.length);
  return {
    percent: Math.round((completed / total) * 100),
    missingRequired,
    missingRecommended,
    eventReady: missingRequired.length === 0,
  };
}

export function contentSuggestions(event) {
  const type = event?.type || 'other';
  if (type === 'birthday') return ['reel', 'collage', 'whatsapp-status', 'image-post', 'greeting-card'];
  if (type === 'anniversary') return ['video', 'collage', 'story', 'image-post'];
  if (type === 'festival' || type === 'national-day') return ['image-post', 'story', 'whatsapp-status', 'collage'];
  if (type === 'trip') return ['reel', 'video', 'story', 'collage'];
  return ['image-post', 'story', 'collage'];
}

export function planningStage(days) {
  if (days === null) return 'unknown';
  if (days <= 0) return 'today';
  if (days <= 1) return 'ready-to-share';
  if (days <= 3) return 'final-review';
  if (days <= 7) return 'rendering';
  if (days <= 14) return 'drafting';
  if (days <= 30) return 'collecting-memories';
  return 'scheduled';
}

export function buildEventCard(event, now = new Date()) {
  const occurrence = event.annual === false ? normalizeDate(event.date) : nextAnnualOccurrence(event.date, now);
  const remaining = daysUntil(occurrence, now);
  return {
    ...event,
    occurrence,
    daysUntil: remaining,
    stage: planningStage(remaining),
    suggestions: contentSuggestions(event),
    urgent: remaining !== null && remaining >= 0 && remaining <= 3,
  };
}

export function buildDirectorFeed({ profiles = [], events = [], now = new Date() } = {}) {
  const profileEvents = [];
  for (const profile of profiles) {
    if (profile.birthday) profileEvents.push({ id: `birthday:${profile.id}`, type: 'birthday', title: `${profile.name}'s birthday`, date: profile.birthday, annual: true, personId: profile.id, relationship: profile.relationship });
    if (profile.anniversary) profileEvents.push({ id: `anniversary:${profile.id}`, type: 'anniversary', title: `${profile.name}'s anniversary`, date: profile.anniversary, annual: true, personId: profile.id, relationship: profile.relationship });
  }
  const upcoming = [...profileEvents, ...events]
    .map(event => buildEventCard(event, now))
    .filter(event => event.occurrence && event.daysUntil !== null && event.daysUntil >= 0)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 25);
  const incompleteProfiles = profiles
    .map(profile => ({ ...profile, completeness: profileCompleteness(profile) }))
    .filter(profile => profile.completeness.percent < 100)
    .sort((a, b) => a.completeness.percent - b.completeness.percent);
  return { upcoming, incompleteProfiles };
}
