import { createHash } from 'crypto';
import { daysUntil } from './life-event-director.js';

const HOLIDAY_API_BASE = process.env.PUBLIC_HOLIDAY_API_BASE || 'https://date.nager.at/api/v4';
const HOLIDAY_HORIZON_DAYS = 30;
const MAX_COUNTRIES = 6;
const MAX_MEMORY_SUGGESTIONS = 4;
const CONFIDENCE_RANK = { high: 0, medium: 1, low: 2 };
const GENERIC_PEOPLE = new Set([
  'person', 'people', 'unknown', 'face', 'user', 'self', 'you', 'add name', 'man', 'woman', 'boy', 'girl',
  'child', 'kid', 'baby', 'adult', 'family', 'friend', 'mother', 'mom', 'father', 'dad',
]);

let regionLookup;

function countryLookup() {
  if (regionLookup) return regionLookup;
  const byName = new Map();
  const labels = new Map();
  const display = new Intl.DisplayNames(['en'], { type: 'region' });
  for (let first = 65; first <= 90; first += 1) {
    for (let second = 65; second <= 90; second += 1) {
      const code = String.fromCharCode(first, second);
      const label = display.of(code);
      if (!label || label === code || /unknown region/i.test(label)) continue;
      const name = label.toLowerCase();
      // CLDR still exposes a few retired region codes (for example FX for
      // Metropolitan France). Keep the first canonical-looking mapping rather
      // than allowing a later retired alias to overwrite the current ISO code.
      if (!byName.has(name)) byName.set(name, code);
      labels.set(code, label);
    }
  }
  const aliases = {
    france: 'FR', usa: 'US', 'united states of america': 'US', america: 'US', uk: 'GB', britain: 'GB', 'great britain': 'GB',
    uae: 'AE', 'south korea': 'KR', 'north korea': 'KP', russia: 'RU', vietnam: 'VN', bolivia: 'BO',
    'czech republic': 'CZ', 'ivory coast': 'CI', 'the netherlands': 'NL', holland: 'NL',
  };
  for (const [name, code] of Object.entries(aliases)) byName.set(name, code);
  regionLookup = { byName, labels };
  return regionLookup;
}

export function countryCodeFor(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^[a-z]{2}$/i.test(raw)) {
    const code = raw.toUpperCase();
    return countryLookup().labels.has(code) ? code : null;
  }
  const clean = raw.replace(/\s+/g, ' ').toLowerCase();
  if (countryLookup().byName.has(clean)) return countryLookup().byName.get(clean);
  const tail = clean.split(',').map((part) => part.trim()).filter(Boolean).at(-1);
  if (tail && countryLookup().byName.has(tail)) return countryLookup().byName.get(tail);
  return null;
}

export function countryLabel(code) {
  return countryLookup().labels.get(String(code || '').toUpperCase()) || String(code || '').toUpperCase();
}

function addCountrySignal(target, value, source, reason) {
  const code = countryCodeFor(value);
  if (!code || target.has(code)) return;
  target.set(code, { code, country: countryLabel(code), source, reason });
}

export function extractCountrySignals({ profiles = [], media = [] } = {}) {
  const signals = new Map();
  for (const profile of profiles) {
    if (profile.currentCountry) addCountrySignal(signals, profile.currentCountry, 'profile', profile.relationship?.toLowerCase() === 'you' || profile.relationship?.toLowerCase() === 'self' ? 'Your current country' : `${profile.name || 'Family'} lives here`);
    for (const origin of profile.originCountries || []) addCountrySignal(signals, origin, 'origin', `${profile.name || 'Your family'} has a connection here`);
  }

  for (const item of media) {
    const analysis = item.aiAnalysis || {};
    const candidates = [
      item.country, item.countryCode, item.location?.country, item.location?.countryCode,
      item.exif?.country, item.exif?.countryCode, analysis.country,
      ...(Array.isArray(analysis.countries) ? analysis.countries : []),
      ...(Array.isArray(analysis.locations) ? analysis.locations : []),
    ];
    for (const candidate of candidates) {
      const code = countryCodeFor(candidate);
      if (code) addCountrySignal(signals, code, 'visited', `You have memories connected to ${countryLabel(code)}`);
    }
  }
  return [...signals.values()].slice(0, MAX_COUNTRIES);
}

function eventText(item = {}) {
  const analysis = item.aiAnalysis || {};
  return [
    item.name, item.userCategory, ...(item.userTags || []), analysis.caption, analysis.description,
    analysis.autoAlbum, analysis.contentType, analysis.textInside, ...(analysis.tags || []),
  ].filter(Boolean).join(' ').toLowerCase();
}

function mediaMomentType(item) {
  const text = eventText(item);
  if (/\b(birthday|happy birthday|birthday party|birthday cake|bday)\b/i.test(text)) return 'birthday';
  if (/\b(wedding anniversary|anniversary celebration|happy anniversary)\b/i.test(text)) return 'anniversary';
  if (/\b(wedding|marriage ceremony)\b/i.test(text)) return 'anniversary';
  return null;
}

function mediaMomentDate(item) {
  const candidates = [
    ['capturedAt', item.capturedAt], ['takenAt', item.takenAt], ['dateTimeOriginal', item.exif?.dateTimeOriginal],
    ['createdAt', item.createdAt],
  ];
  for (const [source, value] of candidates) {
    if (!value) continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return { date, source };
  }
  return null;
}

function validPersonName(value) {
  const name = String(value || '').trim();
  if (!name || GENERIC_PEOPLE.has(name.toLowerCase()) || /^[0-9a-f-]{20,}$/i.test(name) || /^person\s*\d+$/i.test(name)) return null;
  return name.slice(0, 80);
}

function personIdentity(value) {
  if (value && typeof value === 'object') {
    const isSelf = Boolean(value.isSelf);
    const name = validPersonName(value.name || value.displayName);
    return isSelf || name ? { name, isSelf } : null;
  }
  const name = validPersonName(value);
  return name ? { name, isSelf: false } : null;
}

function personForMedia(item, peopleByCluster = {}) {
  for (const clusterId of item.peopleIntelligence?.clusterIds || []) {
    const identity = personIdentity(peopleByCluster[String(clusterId)]);
    if (identity) return identity;
  }
  const analysis = item.aiAnalysis || {};
  const values = [
    ...(Array.isArray(item.people_tags) ? item.people_tags : []),
    ...(Array.isArray(item.people) ? item.people : []),
    ...(Array.isArray(analysis.people) ? analysis.people : []),
    ...(Array.isArray(analysis.faces) ? analysis.faces : []),
  ];
  const name = values.map(validPersonName).find(Boolean) || null;
  return name ? { name, isSelf: false } : null;
}

function stableSuggestionId({ type, personName, personIsSelf, monthDay }) {
  const personKey = personIsSelf ? 'self' : String(personName || '').toLowerCase();
  return createHash('sha256').update(`${type}|${personKey}|${monthDay}`).digest('hex').slice(0, 24);
}

function sameMonthDay(value, monthDay) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` === monthDay;
}

function isSelfProfile(profile) {
  return ['you', 'self', 'me'].includes(String(profile?.relationship || '').trim().toLowerCase());
}

function dateForMonthDay(year, monthDay) {
  const match = /^(\d{2})-(\d{2})$/.exec(String(monthDay || ''));
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

export function resolveProfileCelebrationDate({ monthDay, existingDate, confirmedDate } = {}) {
  if (confirmedDate) {
    const explicit = new Date(confirmedDate);
    return Number.isNaN(explicit.getTime()) ? null : explicit;
  }
  if (!existingDate) return null;
  const existing = new Date(existingDate);
  if (Number.isNaN(existing.getTime())) return null;
  return dateForMonthDay(existing.getUTCFullYear(), monthDay);
}

export function buildMemoryCelebrationSuggestions({ media = [], profiles = [], events = [], peopleByCluster = {}, feedbackIds = [] } = {}) {
  const groups = new Map();
  const dismissed = new Set(feedbackIds.map(String));
  const profileByName = new Map(profiles.map((profile) => [String(profile.name || '').trim().toLowerCase(), profile]));
  const selfProfile = profiles.find(isSelfProfile) || null;

  for (const item of media) {
    const type = mediaMomentType(item);
    if (!type) continue;
    const moment = mediaMomentDate(item);
    if (!moment) continue;
    const person = personForMedia(item, peopleByCluster);
    const personName = person?.name || null;
    const personIsSelf = Boolean(person?.isSelf);
    const monthDay = `${String(moment.date.getMonth() + 1).padStart(2, '0')}-${String(moment.date.getDate()).padStart(2, '0')}`;
    const personKey = personIsSelf ? 'self' : String(personName || '').toLowerCase();
    const key = `${type}|${personKey}|${monthDay}`;
    if (!groups.has(key)) groups.set(key, { type, personName, personIsSelf, monthDay, samples: [] });
    groups.get(key).samples.push({ id: item.id, date: moment.date, source: moment.source });
  }

  const suggestions = [];
  for (const group of groups.values()) {
    const suggestionId = stableSuggestionId(group);
    if (dismissed.has(suggestionId)) continue;
    const profile = group.personIsSelf
      ? selfProfile
      : group.personName ? profileByName.get(group.personName.toLowerCase()) : null;
    const existingDate = group.type === 'birthday' ? profile?.birthday : profile?.anniversary;
    if (sameMonthDay(existingDate, group.monthDay)) continue;
    const requiresFullDate = Boolean(profile && !existingDate);
    const alreadySaved = events.some((event) => event.type === group.type && sameMonthDay(event.date, group.monthDay) && (!group.personName || String(event.title || '').toLowerCase().includes(group.personName.toLowerCase())));
    if (alreadySaved) continue;

    const sample = [...group.samples].sort((a, b) => a.date - b.date)[0];
    const distinctYears = new Set(group.samples.map((entry) => entry.date.getFullYear())).size;
    const monthLabel = new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric' }).format(sample.date);
    const captured = group.samples.some((entry) => entry.source !== 'createdAt');
    const personPrefix = group.personIsSelf ? 'your ' : group.personName ? `${group.personName}'s ` : '';
    const eventLabel = group.type === 'birthday' ? 'birthday' : 'anniversary';
    suggestions.push({
      id: suggestionId,
      kind: 'memory-event',
      type: group.type,
      personName: group.personName,
      personIsSelf: group.personIsSelf,
      requiresFullDate,
      date: sample.date.toISOString(),
      monthDay: group.monthDay,
      sourceMediaIds: group.samples.slice(0, 8).map((entry) => entry.id).filter(Boolean),
      confidence: distinctYears >= 2 ? 'high' : captured ? 'medium' : 'low',
      question: `Is ${personPrefix}${eventLabel} around ${monthLabel}?`,
      evidence: distinctYears >= 2
        ? `SnapNext found ${eventLabel} memories around this date in ${distinctYears} different years.`
        : captured
          ? `SnapNext found ${eventLabel} memories captured around ${monthLabel}.`
          : `SnapNext found ${eventLabel} memories saved around ${monthLabel}. Please confirm the actual date.`,
    });
  }

  return suggestions
    .sort((a, b) => (CONFIDENCE_RANK[a.confidence] ?? 9) - (CONFIDENCE_RANK[b.confidence] ?? 9))
    .slice(0, MAX_MEMORY_SUGGESTIONS);
}

export function buildCelebrationSetupPrompts({ user = {}, profiles = [], favoriteCount = 0 } = {}) {
  const self = profiles.find((profile) => ['you', 'self', 'me'].includes(String(profile.relationship || '').trim().toLowerCase())) || null;
  const familyBirthdays = profiles.filter((profile) => profile !== self && profile.birthday).length;
  const prompts = [];
  if (!self || !self.birthday) prompts.push({ id: 'setup:self-birthday', type: 'setup', title: 'Add your birthday', detail: 'Tell SnapNext once so your memories and celebrations can be ready at the right time.', href: '/event-director' });
  if (self && !self.anniversary) prompts.push({ id: 'setup:self-anniversary', type: 'setup', title: 'Add an anniversary (optional)', detail: 'Marriage or another date that matters to you.', href: '/event-director' });
  if (familyBirthdays === 0 || (favoriteCount > familyBirthdays && familyBirthdays < 3)) prompts.push({ id: 'setup:family-birthdays', type: 'setup', title: 'Add important family birthdays', detail: 'Only the dates you care about. SnapNext will handle the reminders and creation ideas.', href: '/event-director' });
  if (!profiles.some((profile) => profile.currentCountry || (profile.originCountries || []).length)) prompts.push({ id: 'setup:countries', type: 'setup', title: 'Add your home and origin countries', detail: 'This lets SnapNext suggest relevant national and cultural days without guessing your identity.', href: '/event-director' });
  return prompts.slice(0, 4);
}

export function contextualHolidayFromApi(holiday, signal, now = new Date()) {
  if (!holiday?.date || !holiday?.name) return null;
  const date = new Date(`${holiday.date}T09:00:00`);
  const remaining = daysUntil(date, now);
  if (remaining === null || remaining < 0 || remaining > HOLIDAY_HORIZON_DAYS) return null;
  const types = Array.isArray(holiday.holidayTypes) ? holiday.holidayTypes : [];
  if (types.length && !types.some((type) => ['Public', 'Optional', 'Observance'].includes(type))) return null;
  return {
    id: `holiday:${signal.code}:${holiday.date}:${holiday.name}`,
    type: holiday.nationalHoliday ? 'national-day' : 'festival',
    title: holiday.name,
    date: date.toISOString(),
    occurrence: date,
    annual: true,
    daysUntil: remaining,
    source: signal.source,
    country: signal.country,
    countryCode: signal.code,
    reason: signal.reason,
    contextual: true,
    holidayTypes: types,
  };
}

async function fetchCountryHolidays(code, year, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1200);
  try {
    const response = await fetchImpl(`${HOLIDAY_API_BASE}/Holidays/${encodeURIComponent(code)}/${year}`, {
      headers: { accept: 'application/json' }, signal: controller.signal, cache: 'force-cache', next: { revalidate: 86400 },
    });
    if (!response.ok) return [];
    const value = await response.json();
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function buildContextualCelebrations({ profiles = [], media = [], now = new Date(), fetchImpl = fetch } = {}) {
  const signals = extractCountrySignals({ profiles, media });
  if (!signals.length) return [];
  const years = [now.getFullYear(), now.getFullYear() + 1];
  const batches = await Promise.all(signals.flatMap((signal) => years.map(async (year) => ({ signal, holidays: await fetchCountryHolidays(signal.code, year, fetchImpl) }))));
  const seen = new Set();
  const items = [];
  for (const batch of batches) {
    for (const holiday of batch.holidays) {
      const item = contextualHolidayFromApi(holiday, batch.signal, now);
      if (!item) continue;
      const key = `${item.countryCode}|${item.title.toLowerCase()}|${String(item.date).slice(0, 10)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  }
  return items.sort((a, b) => a.daysUntil - b.daysUntil).slice(0, 20);
}
