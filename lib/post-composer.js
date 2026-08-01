// Deterministic post building — no model, no network, no credits.
//
// Hashtags and emojis are derived from words the user's own library already
// contains. Same input always gives the same output, which is what makes these
// safe to offer free on every plan.

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'for', 'from',
  'had', 'has', 'have', 'her', 'his', 'how', 'in', 'into', 'is', 'it', 'its',
  'me', 'my', 'of', 'on', 'or', 'our', 'out', 'she', 'so', 'that', 'the',
  'their', 'them', 'then', 'there', 'these', 'they', 'this', 'to', 'up', 'was',
  'we', 'were', 'what', 'when', 'where', 'which', 'who', 'will', 'with', 'you',
  'your', 'moment', 'worth', 'keeping', 'close', 'saved', 'memory', 'library',
]);

// Ordered most specific first so "birthday" wins over a generic "day" match.
const EMOJI_RULES = [
  [/\b(birthday|cake|candle)\b/i, '🎂'],
  [/\b(wedding|bride|groom|marriage)\b/i, '💍'],
  [/\b(beach|sea|ocean|surf|coast)\b/i, '🌊'],
  [/\b(mountain|hike|hiking|trek|summit)\b/i, '⛰️'],
  [/\b(snow|ski|winter|frost)\b/i, '❄️'],
  [/\b(travel|trip|holiday|vacation|journey)\b/i, '✈️'],
  [/\b(food|dinner|lunch|meal|restaurant|coffee)\b/i, '🍽️'],
  [/\b(dog|puppy|cat|kitten|pet)\b/i, '🐾'],
  [/\b(concert|music|festival|band)\b/i, '🎶'],
  [/\b(family|friends|together|reunion)\b/i, '🫶'],
  [/\b(sunset|sunrise|golden)\b/i, '🌅'],
  [/\b(garden|flower|bloom|spring)\b/i, '🌸'],
  [/\b(city|street|skyline|urban)\b/i, '🏙️'],
  [/\b(baby|newborn|child|kids)\b/i, '👶'],
];

const DEFAULT_EMOJIS = '✨';
const MAX_HASHTAGS = 12;

function words(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function toHashtag(value) {
  const cleaned = String(value || '').replace(/[^a-zA-Z0-9]/g, '');
  return cleaned.length > 1 ? `#${cleaned}` : '';
}

/**
 * Builds hashtags from the user's own tags first, topping up with distinctive
 * words from the caption. Always returns something usable.
 */
export function buildHashtags({ text = '', tags = [] } = {}) {
  const seen = new Set();
  const out = [];

  const push = value => {
    const tag = toHashtag(value);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key) || out.length >= MAX_HASHTAGS) return;
    seen.add(key);
    out.push(tag);
  };

  for (const tag of Array.isArray(tags) ? tags : []) push(tag);
  for (const word of words(text)) {
    if (word.length < 4 || STOPWORDS.has(word) || /^\d+$/.test(word)) continue;
    push(word);
  }

  if (!out.length) return ['#SnapNext', '#Memories'];
  push('SnapNext');
  return out;
}

/** Picks emojis whose trigger words actually appear in the text. */
export function buildEmojis(text = '', limit = 3) {
  const source = String(text || '');
  const picked = [];
  for (const [pattern, emoji] of EMOJI_RULES) {
    if (picked.length >= limit) break;
    if (pattern.test(source) && !picked.includes(emoji)) picked.push(emoji);
  }
  return picked.length ? picked.join('') : DEFAULT_EMOJIS;
}
