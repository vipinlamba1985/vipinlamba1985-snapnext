// One declaration of how every creative feature is paid for.
//
// The rule this file exists to enforce: a feature that calls an external model
// must be metered before it runs, and a feature that does not must not pretend
// to charge for one. Both halves matter — silent spend is how a free tier
// becomes expensive, and fake charges are how users stop trusting the meter.
//
// Billing modes:
//   included_free   Deterministic output built from data the user already owns.
//                   No provider call, so no credit is consumed, on any plan.
//   ai_credits      Calls an external model. MUST reserve through
//                   lib/ai-spend-gate.js (via lib/ai/gateway.js) before the
//                   call and settle or release afterwards.
//   prepaid_credits Paid for up front with its own pack, so it never draws on
//                   the weekly plan allowance.

export const CREATIVE_BILLING = Object.freeze({
  FREE: 'included_free',
  METERED: 'ai_credits',
  PREPAID: 'prepaid_credits',
});

export const CREATIVE_FEATURES = Object.freeze({
  post_caption: {
    id: 'post_caption',
    label: 'Post caption',
    billing: CREATIVE_BILLING.FREE,
    credits: 0,
    grounding: 'Written from the details already saved with your photo.',
  },
  post_hashtags: {
    id: 'post_hashtags',
    label: 'Hashtags',
    billing: CREATIVE_BILLING.FREE,
    credits: 0,
    grounding: 'Taken from your own tags and caption wording.',
  },
  post_emojis: {
    id: 'post_emojis',
    label: 'Emojis',
    billing: CREATIVE_BILLING.FREE,
    credits: 0,
    grounding: 'Matched to words already in your caption.',
  },
  photo_enhance: {
    id: 'photo_enhance',
    label: 'Photo enhancement',
    billing: CREATIVE_BILLING.METERED,
    // Ceiling, not a flat charge: the gateway reserves this much and releases
    // whatever the provider did not use.
    credits: 12,
    grounding: 'Runs an external model. Your original is never overwritten.',
  },
  photo_restoration: {
    id: 'photo_restoration',
    label: 'Photo restoration',
    billing: CREATIVE_BILLING.PREPAID,
    credits: 0,
    grounding: 'Uses Restoration Credits, so it never spends your weekly AI allowance.',
  },
});

export function creativeFeature(id) {
  return CREATIVE_FEATURES[String(id || '').trim()] || null;
}

/** True when the feature calls an external model and must be metered first. */
export function isMeteredFeature(id) {
  return creativeFeature(id)?.billing === CREATIVE_BILLING.METERED;
}

/**
 * The billing block a route returns so the client can tell the user what a
 * button will cost before they press it.
 */
export function billingDisclosure(id) {
  const feature = creativeFeature(id);
  if (!feature) return null;
  return {
    feature: feature.id,
    label: feature.label,
    billing: feature.billing,
    credits: feature.credits,
    freeOnEveryPlan: feature.billing === CREATIVE_BILLING.FREE,
    grounding: feature.grounding,
  };
}

/** Every feature that must never reach a provider without a reservation. */
export function meteredFeatureIds() {
  return Object.values(CREATIVE_FEATURES)
    .filter(feature => feature.billing === CREATIVE_BILLING.METERED)
    .map(feature => feature.id);
}
