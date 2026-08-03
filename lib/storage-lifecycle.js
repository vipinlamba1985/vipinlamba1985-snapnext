// S3 lifecycle policy for photo storage.
//
// The problem this solves: a photo from 2019 that nobody has opened in four
// years costs exactly as much to keep as one uploaded this morning. A photo
// library is mostly old photos, so most of the storage bill is rent on things
// nobody visits.
//
// Glacier Instant Retrieval stores at roughly $0.004/GB against $0.023/GB for
// Standard — about 83% less — and still returns objects in milliseconds. A user
// opening a 2019 photo sees no difference at all, which is the whole point:
// this saves money without touching the experience.
//
// No imports, so the policy can be inspected and tested without an AWS client.

/** Published S3 prices per GB-month, used for the projection below. */
export const STORAGE_CLASS_USD_PER_GB_MONTH = Object.freeze({
  STANDARD: 0.023,
  STANDARD_IA: 0.0125,
  GLACIER_IR: 0.004,
});

/**
 * Days before a photo moves down a tier.
 *
 * Nothing moves before 90 days: Glacier Instant Retrieval bills a 90-day
 * minimum per object, so moving a recent photo and then having it opened or
 * deleted costs more than leaving it in Standard.
 */
export const TRANSITION_DAYS = Object.freeze({
  STANDARD_IA: 90,
  GLACIER_IR: 365,
});

/**
 * The lifecycle configuration to apply to the media bucket.
 *
 * Originals live under `users/` (see lib/storage.js) and are the only objects
 * moved. Derivatives under `thumbs/` stay in Standard permanently — they are
 * small, they are read on every scroll, and moving them would put a retrieval
 * charge on ordinary browsing for almost no saving.
 *
 * This is only safe because thumbnails are cached as their own objects. While
 * the grid rendered by streaming originals, every scroll read the very files
 * this rule moves to cold storage — and a Glacier read costs more than a month
 * of Glacier storage, so the policy would have lost money. Do not apply it to a
 * deployment whose derivatives are still generated from originals on demand.
 */
export function mediaLifecycleConfiguration({ originalsPrefix = 'users/', derivativesPrefix = 'thumbs/' } = {}) {
  return {
    Rules: [
      {
        ID: 'snapnext-originals-cooldown',
        Status: 'Enabled',
        Filter: { Prefix: originalsPrefix },
        Transitions: [
          { Days: TRANSITION_DAYS.STANDARD_IA, StorageClass: 'STANDARD_IA' },
          { Days: TRANSITION_DAYS.GLACIER_IR, StorageClass: 'GLACIER_IR' },
        ],
        // Incomplete multipart uploads are invisible and billable forever.
        AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
      },
      {
        ID: 'snapnext-derivatives-stay-hot',
        Status: 'Enabled',
        Filter: { Prefix: derivativesPrefix },
        AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
      },
      {
        // Trash is already reversible in the product; this only reclaims
        // storage for objects the application has finished with.
        ID: 'snapnext-expire-deleted-versions',
        Status: 'Enabled',
        Filter: { Prefix: '' },
        NoncurrentVersionExpiration: { NoncurrentDays: 30 },
      },
    ],
  };
}

/**
 * Projects the monthly saving for a library of a given size.
 *
 * `agedFraction` is the share of stored bytes older than the Glacier
 * transition — for a mature photo library this is most of it.
 */
export function projectedMonthlySaving({ totalGb = 0, agedFraction = 0.7 }) {
  const total = Math.max(0, Number(totalGb) || 0);
  const aged = Math.min(1, Math.max(0, Number(agedFraction) || 0));

  const agedGb = total * aged;
  const hotGb = total - agedGb;

  const before = total * STORAGE_CLASS_USD_PER_GB_MONTH.STANDARD;
  const after = (hotGb * STORAGE_CLASS_USD_PER_GB_MONTH.STANDARD)
    + (agedGb * STORAGE_CLASS_USD_PER_GB_MONTH.GLACIER_IR);

  return {
    beforeUsd: Math.round(before * 100) / 100,
    afterUsd: Math.round(after * 100) / 100,
    savedUsd: Math.round((before - after) * 100) / 100,
    savedPercent: before > 0 ? Math.round(((before - after) / before) * 100) : 0,
  };
}

/**
 * Retrieval from Glacier Instant Retrieval costs about $0.03/GB. Ordinary
 * browsing is unaffected — thumbnails never leave Standard — but downloading a
 * whole library reads every original at once, which is the one pattern that can
 * turn a storage saving into a retrieval bill.
 */
export const GLACIER_RETRIEVAL_USD_PER_GB = 0.03;

export function estimatedRetrievalCostUsd(gb = 0) {
  return Math.max(0, Number(gb) || 0) * GLACIER_RETRIEVAL_USD_PER_GB;
}
