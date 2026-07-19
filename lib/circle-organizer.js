import { v4 as uuidv4 } from 'uuid';

export const ATTENTION_MODES = {
  calm: { immediateThreshold: 90, digestThreshold: 70, label: 'Calm' },
  balanced: { immediateThreshold: 80, digestThreshold: 55, label: 'Balanced' },
  connected: { immediateThreshold: 65, digestThreshold: 35, label: 'Connected' },
  custom: { immediateThreshold: 80, digestThreshold: 50, label: 'Custom' },
};

export const ORGANIZER_BUCKETS = ['today', 'later', 'library'];
export const SIGNAL_TYPES = ['link', 'reminder', 'note', 'native', 'rss', 'calendar', 'email', 'github', 'youtube'];

export function normalizeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

export function classifySignal(input = {}, preferences = {}) {
  const mode = ATTENTION_MODES[preferences.mode] || ATTENTION_MODES.balanced;
  const priority = Math.max(0, Math.min(100, Number(input.priority ?? 50)));
  const dueAt = input.dueAt ? new Date(input.dueAt) : null;
  const now = new Date();
  const isDueSoon = dueAt && Number.isFinite(dueAt.getTime()) && dueAt.getTime() <= now.getTime() + 24 * 60 * 60 * 1000;
  const isPermanent = input.keep === true || input.signalType === 'note' || input.signalType === 'link';

  let bucket = isDueSoon || priority >= mode.immediateThreshold ? 'today' : priority >= mode.digestThreshold ? 'later' : 'library';
  if (isPermanent && priority < mode.immediateThreshold) bucket = 'library';

  return {
    bucket,
    delivery: priority >= mode.immediateThreshold ? 'show_now' : priority >= mode.digestThreshold ? 'digest' : 'silent',
    reason: isDueSoon ? 'Due within 24 hours' : priority >= mode.immediateThreshold ? 'Matches your high-priority threshold' : priority >= mode.digestThreshold ? 'Useful, but not urgent' : 'Saved quietly for later reference',
    priority,
  };
}

export function buildSignalDocument(userId, body = {}, preferences = {}) {
  const title = String(body.title || '').trim();
  if (!title) throw new Error('Title is required');
  const signalType = SIGNAL_TYPES.includes(body.signalType) ? body.signalType : 'note';
  const originalUrl = normalizeUrl(body.originalUrl);
  if (body.originalUrl && !originalUrl) throw new Error('A valid URL is required');
  const decision = classifySignal({ ...body, signalType }, preferences);
  const now = new Date();
  return {
    id: uuidv4(),
    userId,
    circleId: body.circleId || null,
    signalType,
    title,
    summary: String(body.summary || '').trim(),
    originalUrl: originalUrl || null,
    sourceLabel: String(body.sourceLabel || '').trim() || 'Added by you',
    priority: decision.priority,
    bucket: body.bucket && ORGANIZER_BUCKETS.includes(body.bucket) ? body.bucket : decision.bucket,
    delivery: decision.delivery,
    why: decision.reason,
    dueAt: body.dueAt ? new Date(body.dueAt) : null,
    isRead: false,
    isSaved: decision.bucket === 'library',
    isHidden: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildDefaultPreferences(userId) {
  const now = new Date();
  return {
    userId,
    mode: 'balanced',
    digestEnabled: true,
    digestHour: 19,
    quietHours: { start: 21, end: 8 },
    badgeMode: 'important_unread',
    createdAt: now,
    updatedAt: now,
  };
}

export function buildDigest(signals = []) {
  const visible = signals.filter((signal) => !signal.isHidden);
  const sections = {
    today: visible.filter((signal) => signal.bucket === 'today'),
    later: visible.filter((signal) => signal.bucket === 'later'),
    library: visible.filter((signal) => signal.bucket === 'library'),
  };
  return {
    counts: {
      received: visible.length,
      important: sections.today.filter((signal) => !signal.isRead).length,
      digest: sections.later.length,
      organizedSilently: sections.library.length,
    },
    sections,
  };
}
