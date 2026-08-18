export const CREATED_REEL_ORIGIN = 'canonical-reel-v1';
export const CREATED_REEL_READY_STORY_TYPE = 'created-reel';
export const CREATED_REEL_READY_STORY_GENERATOR = 'ready-story-v2';

function dateOf(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => String(value || '').trim()).filter(Boolean))];
}

function safeSlug(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'reel';
}

function sourceIdsFor(item = {}) {
  return unique(item.sourceMediaIds?.length ? item.sourceMediaIds : item.creativeOrigin?.sourceMediaIds).slice(0, 20);
}

export function isSavedCanonicalReel(item = {}) {
  return Boolean(
    item?.id
    && item?.kind === 'video'
    && item?.trashed !== true
    && item?.creativeOrigin?.type === CREATED_REEL_ORIGIN,
  );
}

export function buildCreatedReelReadyStoryCandidates({ media = [], limit = 8 } = {}) {
  const items = Array.isArray(media) ? media : [];
  const byId = new Map(items.filter(item => item?.id).map(item => [String(item.id), item]));
  const reels = items
    .filter(isSavedCanonicalReel)
    .sort((left, right) => (dateOf(right.uploadedAt || right.createdAt)?.getTime() || 0) - (dateOf(left.uploadedAt || left.createdAt)?.getTime() || 0));

  return reels.slice(0, Math.max(1, Math.min(8, Number(limit) || 8))).map((reel, index) => {
    const sourceMediaIds = sourceIdsFor(reel);
    const photoIds = sourceMediaIds
      .filter(id => byId.get(id)?.kind === 'photo' && byId.get(id)?.trashed !== true)
      .slice(0, 16);
    const happenedAt = dateOf(reel.uploadedAt || reel.createdAt || reel.creativeOrigin?.createdAt);
    const sourceCount = sourceMediaIds.length || 1;
    const durationMs = Math.max(0, Number(reel.durationMs || reel.creativeOrigin?.durationMs || 0));

    return {
      id: `ready-created-reel-${safeSlug(reel.id)}`,
      type: CREATED_REEL_READY_STORY_TYPE,
      title: index === 0 ? 'Your latest Memory Reel' : 'Your saved Memory Reel',
      kicker: 'Created in SnapNext',
      caption: `${sourceCount} saved ${sourceCount === 1 ? 'memory is' : 'memories are'} already edited into a finished Reel. Review the real video, keep it private, or share it when you choose.`,
      videoMediaId: String(reel.id),
      mediaIds: photoIds,
      collageMediaIds: photoIds.slice(0, 6),
      reelMediaIds: photoIds.slice(0, 8),
      reelFrames: photoIds.slice(0, 8).map(mediaId => ({ mediaId, caption: '' })),
      collageLayout: 'cinema',
      sourceCount,
      selectedCount: photoIds.length || sourceCount,
      durationMs,
      score: 190 - Math.min(index, 7),
      happenedAt: happenedAt?.toISOString() || null,
      source: {
        kind: 'created-reel',
        id: String(reel.id),
        renderArtifactId: reel.creativeOrigin?.renderArtifactId || null,
        manifestHash: reel.creativeOrigin?.manifestHash || null,
      },
      generator: CREATED_REEL_READY_STORY_GENERATOR,
      intelligence: 'saved-create-output',
      approvalRequired: true,
      autoPost: false,
      status: 'ready',
    };
  });
}
