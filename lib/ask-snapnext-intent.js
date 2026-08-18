// Ask SnapNext V2 intent and action routing.
//
// This module is deliberately pure and provider-free. It decides which existing
// SnapNext surface can safely continue an explicit user request. It never
// executes a paid task, shares media, infers a relationship, or calls an AI
// provider. The existing LifeGPT retrieval/AI gateway remains authoritative for
// answering questions and for any metered narrative generation.

export const ASK_SNAPNEXT_ACTION_VERSION = 2;

const INTERNAL_DESTINATIONS = Object.freeze({
  library: '/gallery',
  create: '/create/reel',
  restore: '/ai-studio/restoration',
  enhance: '/ai-studio/enhance',
  circle: '/circles',
  privacy: '/privacy-security',
});

function normalize(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function action(id, label, href, detail) {
  if (!Object.values(INTERNAL_DESTINATIONS).includes(href)) throw new Error('Ask SnapNext actions must stay inside approved SnapNext destinations.');
  return {
    version: ASK_SNAPNEXT_ACTION_VERSION,
    id,
    label,
    href,
    detail,
    executesTask: false,
    spendsCredits: false,
    sharesMedia: false,
    requiresUserTap: true,
  };
}

export function classifyAskSnapNextIntent(query) {
  const q = normalize(query);
  if (!q) return 'answer';

  const reelWords = /\b(reel|highlight video|memory video|short video|slideshow)\b/;
  const creationVerb = /\b(make|create|build|prepare|turn|produce|generate)\b/;
  if (reelWords.test(q) && (creationVerb.test(q) || /\binto\b/.test(q))) return 'create_reel';

  if (/\b(restore|repair|recover|revive)\b.*\b(photo|picture|image)\b|\bold photo\b/.test(q)) return 'restore_photo';
  if (/\b(enhance|unblur|sharpen|improve|clean up|fix)\b.*\b(photo|picture|image)\b/.test(q)) return 'enhance_photo';

  // Sharing is always a navigation handoff. Ask SnapNext never sends anything
  // itself; Circle performs its own permission and approval checks.
  if (/\b(share|send)\b/.test(q) && /\b(circle|family|friend|friends|parent|parents|dad|mom|mum|grandparent|grandparents)\b/.test(q)) return 'share';

  if (/\b(find|show|search|locate|where|when|which|latest|recent|newest|oldest)\b/.test(q)) return 'search';
  return 'answer';
}

export function buildAskSnapNextActions({ query, matchCount = 0, clarificationNeeded = false } = {}) {
  if (clarificationNeeded) return [];
  const intent = classifyAskSnapNextIntent(query);

  if (intent === 'create_reel') {
    return [action(
      'continue-in-create',
      matchCount > 0 ? 'Use these memories in Create' : 'Continue in Create',
      INTERNAL_DESTINATIONS.create,
      'Open the Reel builder to review the memory selection, format and soundtrack before any render starts.',
    )];
  }

  if (intent === 'restore_photo') {
    return [action(
      'open-photo-restoration',
      'Open Photo Restoration',
      INTERNAL_DESTINATIONS.restore,
      'Choose the photo and review any paid restoration step before processing starts.',
    )];
  }

  if (intent === 'enhance_photo') {
    return [action(
      'open-photo-enhance',
      'Open Photo Enhance',
      INTERNAL_DESTINATIONS.enhance,
      'Choose the photo and review the available enhancement path before processing starts.',
    )];
  }

  if (intent === 'share') {
    return [action(
      'open-circle',
      'Open Circle',
      INTERNAL_DESTINATIONS.circle,
      'Choose the people and memories yourself. Ask SnapNext never shares automatically.',
    )];
  }

  if (intent === 'search' && matchCount > 0) {
    return [action(
      'open-library',
      'Open Library',
      INTERNAL_DESTINATIONS.library,
      'Browse your full private library. The verified matches remain visible in this answer.',
    )];
  }

  return [];
}

export function askSnapNextCapabilities() {
  return [
    { id: 'find', label: 'Find a memory', example: 'Find my passport photo' },
    { id: 'timeline', label: 'Understand a timeline', example: 'When was our Montreal trip?' },
    { id: 'recap', label: 'Summarize memories', example: 'Summarize my summer memories' },
    { id: 'create', label: 'Prepare something to create', example: 'Prepare a reel from this trip' },
  ];
}
