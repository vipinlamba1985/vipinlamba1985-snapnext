import { v4 as uuidv4 } from 'uuid';

export const CIRCLE_PLATFORMS = ['instagram', 'youtube', 'x', 'tiktok', 'facebook', 'linkedin', 'reddit', 'github', 'rss', 'website', 'other'];

export const CONNECTION_MODES = {
  instagram: 'link_only',
  youtube: 'public_api',
  x: 'public_api',
  tiktok: 'oauth_required',
  facebook: 'oauth_required',
  linkedin: 'oauth_required',
  reddit: 'public_api',
  github: 'public_api',
  rss: 'public_api',
  website: 'link_only',
  other: 'link_only',
};

export const PLATFORM_RIGHTS = {
  instagram: { canDisplayExcerpt: false, canDisplayThumbnail: false, canEmbed: true, canSummarize: false, retentionClass: 'metadata' },
  youtube: { canDisplayExcerpt: true, canDisplayThumbnail: true, canEmbed: true, canSummarize: true, retentionClass: 'metadata' },
  x: { canDisplayExcerpt: true, canDisplayThumbnail: true, canEmbed: true, canSummarize: true, retentionClass: 'metadata' },
  tiktok: { canDisplayExcerpt: true, canDisplayThumbnail: true, canEmbed: true, canSummarize: true, retentionClass: 'metadata' },
  facebook: { canDisplayExcerpt: false, canDisplayThumbnail: false, canEmbed: true, canSummarize: false, retentionClass: 'metadata' },
  linkedin: { canDisplayExcerpt: false, canDisplayThumbnail: false, canEmbed: true, canSummarize: false, retentionClass: 'metadata' },
  reddit: { canDisplayExcerpt: true, canDisplayThumbnail: true, canEmbed: false, canSummarize: true, retentionClass: 'metadata' },
  github: { canDisplayExcerpt: true, canDisplayThumbnail: false, canEmbed: false, canSummarize: true, retentionClass: 'metadata' },
  rss: { canDisplayExcerpt: true, canDisplayThumbnail: true, canEmbed: false, canSummarize: true, retentionClass: 'metadata' },
  website: { canDisplayExcerpt: true, canDisplayThumbnail: true, canEmbed: false, canSummarize: true, retentionClass: 'metadata' },
  other: { canDisplayExcerpt: false, canDisplayThumbnail: false, canEmbed: false, canSummarize: false, retentionClass: 'metadata' },
};

export function normalizePlatform(value) {
  const platform = String(value || '').toLowerCase().trim();
  return CIRCLE_PLATFORMS.includes(platform) ? platform : 'other';
}

export function normalizeSourceInput(input, selectedPlatform) {
  const raw = String(input || '').trim();
  const platform = normalizePlatform(selectedPlatform);
  const handle = raw.startsWith('@') ? raw.slice(1).trim() : raw;
  let profileUrl = raw;
  if (!/^https?:\/\//i.test(raw)) {
    const urls = {
      instagram: `https://instagram.com/${handle}`,
      youtube: `https://youtube.com/@${handle}`,
      x: `https://x.com/${handle}`,
      tiktok: `https://tiktok.com/@${handle}`,
      facebook: `https://facebook.com/${handle}`,
      linkedin: `https://linkedin.com/in/${handle}`,
      reddit: `https://reddit.com/u/${handle}`,
      github: `https://github.com/${handle}`,
    };
    profileUrl = urls[platform] || raw;
  }
  return { platform, handle: handle || raw, profileUrl };
}

export function buildCircleDocument(userId, body = {}) {
  const name = String(body.name || '').trim();
  if (!name) throw new Error('Circle name is required');
  const now = new Date();
  return {
    id: uuidv4(), userId, name, description: String(body.description || '').trim(), icon: body.icon || 'Users',
    circleType: body.circleType || 'custom', notificationLevel: body.notificationLevel || 'important',
    aiInstructions: String(body.aiInstructions || '').trim(), priority: Number(body.priority || 50),
    privacy: 'private', isArchived: false, createdAt: now, updatedAt: now,
  };
}

export function buildSourceDocument(userId, circleId, body = {}) {
  const normalized = normalizeSourceInput(body.input || body.handle || body.profileUrl, body.platform);
  if (!normalized.handle) throw new Error('Username or profile URL is required');
  const now = new Date();
  return {
    id: uuidv4(), userId, circleId, platform: normalized.platform, handle: normalized.handle,
    displayName: String(body.displayName || normalized.handle).trim(), profileUrl: normalized.profileUrl,
    avatarUrl: null, sourceType: 'account', connectionMode: CONNECTION_MODES[normalized.platform],
    connectionStatus: CONNECTION_MODES[normalized.platform] === 'link_only' ? 'link_only' : 'pending_setup',
    priority: Number(body.priority || 50), isMuted: false, lastCheckedAt: null, lastSuccessAt: null,
    rights: PLATFORM_RIGHTS[normalized.platform] || PLATFORM_RIGHTS.other, createdAt: now, updatedAt: now,
  };
}

export function cleanMongo(document) {
  if (!document) return document;
  const { _id, ...rest } = document;
  return rest;
}
