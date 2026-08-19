import crypto from 'crypto';

import {
  MAGIC_BLUEPRINT_VERSION,
  MAGIC_CARD_MIN_ASSETS_DEFAULT,
  MIN_MAGIC_CARDS_DEFAULT,
  SCREENSHOT_FILENAME_REGEX,
  buildMagicCards,
  buildMagicCoveragePipeline,
  cardSortTime,
  compareCardAssets,
  deriveMagicEligibility,
  eligibilityFieldsForItem,
  filterManifestForDelivery,
} from './magic-manifest.js';
import { cloudFaceRecognitionConsent, hasFaceProcessingConsent } from './intelligence/face-gate.js';

const BLOCKING_DELETION_STATES = new Set(['pending', 'processing', 'verifying', 'failed']);
const COLLECTION_TYPES = new Set(['photos', 'videos', 'favorites', 'screenshots']);

function positiveInt(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

export function magicManifestConfig(env = process.env) {
  const functionDurationSeconds = positiveInt(env.MAGIC_MANIFEST_MAX_DURATION_SECONDS, 300, { min: 30, max: 1800 });
  const leaseSeconds = positiveInt(env.MAGIC_MANIFEST_LEASE_SECONDS, functionDurationSeconds + 120, {
    min: functionDurationSeconds + 30,
    max: 7200,
  });
  return {
    minMagicCards: positiveInt(env.MIN_MAGIC_CARDS, MIN_MAGIC_CARDS_DEFAULT, { min: 1, max: 12 }),
    minAssetsPerCard: positiveInt(env.MAGIC_CARD_MIN_ASSETS, MAGIC_CARD_MIN_ASSETS_DEFAULT, { min: 2, max: 100 }),
    maxUsersPerRun: positiveInt(env.MAGIC_MANIFEST_MAX_USERS_PER_RUN, 25, { min: 1, max: 100 }),
    quietMinutes: positiveInt(env.MAGIC_MANIFEST_QUIET_MINUTES, 10, { min: 1, max: 180 }),
    minIntervalMinutes: positiveInt(env.MAGIC_MANIFEST_MIN_INTERVAL_MINUTES, 15, { min: 1, max: 1440 }),
    maxDirtyMinutes: positiveInt(env.MAGIC_MANIFEST_MAX_DIRTY_MINUTES, 60, { min: 5, max: 1440 }),
    functionDurationSeconds,
    leaseSeconds,
    safeRuntimeMs: positiveInt(env.MAGIC_MANIFEST_SAFE_RUNTIME_MS, Math.max(15_000, (functionDurationSeconds - 60) * 1000), {
      min: 10_000,
      max: Math.max(10_000, (functionDurationSeconds - 15) * 1000),
    }),
  };
}

function dateMs(value) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function faceCardsAllowedForState(user = {}, deletionRequest = null) {
  if (!hasFaceProcessingConsent(user)) return false;
  if (!deletionRequest) return true;

  const status = String(deletionRequest.status || 'none');
  if (BLOCKING_DELETION_STATES.has(status)) return false;
  if (status !== 'verified_deleted') return true;

  // A verified deletion belongs to the lifecycle that ended before it. The
  // only way a face-derived card can reappear is a fresh explicit grant after
  // that deletion was verified.
  const consent = cloudFaceRecognitionConsent(user);
  const verifiedAt = dateMs(deletionRequest.verifiedAt);
  const grantedAt = dateMs(consent.grantedAt);
  return Boolean(verifiedAt && grantedAt && grantedAt > verifiedAt);
}

export async function markMagicManifestDirty(db, userId, reason = 'asset_changed', now = new Date()) {
  if (!db || !userId) return;
  const states = db.collection('magic_manifest_state');
  const current = await states.findOne(
    { user_id: userId },
    { projection: { dirty: 1, first_dirty_at: 1 } },
  );
  const firstDirtyAt = current?.dirty ? (current.first_dirty_at || now) : now;
  await states.updateOne(
    { user_id: userId },
    {
      $set: {
        dirty: true,
        first_dirty_at: firstDirtyAt,
        dirty_at: now,
        blueprint_version: MAGIC_BLUEPRINT_VERSION,
        updated_at: now,
      },
      $inc: { dirty_revision: 1 },
      $addToSet: { dirty_reasons: String(reason || 'asset_changed') },
      $setOnInsert: { created_at: now },
    },
    { upsert: true },
  );
}

function sourceRevision(items = []) {
  const hash = crypto.createHash('sha256');
  for (const item of [...items].sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')))) {
    hash.update(JSON.stringify({
      id: item.id || '',
      name: item.name || '',
      kind: item.kind || '',
      favorite: Boolean(item.favorite || item.isFavorite),
      trashed: Boolean(item.trashed),
      userCategory: item.userCategory || '',
      userScreenshotType: item.userScreenshotType || '',
      screenshotTypeSource: item.screenshotTypeSource || '',
      capturedAt: item.capturedAt || null,
      takenAt: item.takenAt || null,
      mediaCreatedAt: item.mediaCreatedAt || null,
      uploadedAt: item.uploadedAt || null,
    }));
    hash.update('\n');
  }
  return hash.digest('hex');
}

function dirtyReasonForManifest(reasons = []) {
  const values = new Set((Array.isArray(reasons) ? reasons : []).map(value => String(value)));
  if (values.has('asset_deleted') || values.has('asset_trashed')) return 'deletion';
  if (values.has('favorite_changed')) return 'favorite_change';
  if (values.has('eligibility_changed')) return 'eligibility_backfill';
  return 'asset_changes';
}

async function loadManifestMedia(db, userId) {
  return db.collection('media')
    .find({ userId })
    .project({
      _id: 0,
      id: 1,
      name: 1,
      kind: 1,
      favorite: 1,
      isFavorite: 1,
      trashed: 1,
      userCategory: 1,
      userScreenshotType: 1,
      screenshotType: 1,
      screenshotTypeSource: 1,
      capturedAt: 1,
      takenAt: 1,
      mediaCreatedAt: 1,
      uploadedAt: 1,
      createdAt: 1,
      magic_eligible: 1,
      magic_reason_code: 1,
      magic_blueprint_version: 1,
    })
    .toArray();
}

async function persistEligibilityDecisions(db, userId, items, now) {
  const operations = [];
  let eligibleCount = 0;
  for (const item of items) {
    const fields = eligibilityFieldsForItem(item, now);
    if (fields.magic_eligible === true) eligibleCount += 1;
    const changed = item.magic_blueprint_version !== fields.magic_blueprint_version
      || item.magic_eligible !== fields.magic_eligible
      || item.magic_reason_code !== fields.magic_reason_code;
    Object.assign(item, fields);
    if (!changed) continue;
    operations.push({
      updateOne: {
        filter: { userId, id: item.id },
        update: { $set: fields },
      },
    });
  }

  for (let index = 0; index < operations.length; index += 500) {
    await db.collection('media').bulkWrite(operations.slice(index, index + 500), { ordered: false });
  }
  return { updated: operations.length, eligibleCount };
}

export async function generateMagicManifestForUser({
  db,
  userId,
  generationReason = 'scheduled_recovery',
  now = new Date(),
  config = magicManifestConfig(),
} = {}) {
  if (!db || !userId) throw new Error('Magic manifest generation requires db and userId.');

  const items = await loadManifestMedia(db, userId);
  const eligibility = await persistEligibilityDecisions(db, userId, items, now);
  const activeItems = items.filter(item => item.trashed !== true);
  const cards = buildMagicCards(activeItems, { minAssets: config.minAssetsPerCard });
  const manifest = {
    manifest_id: crypto.randomUUID(),
    user_id: userId,
    blueprint_version: MAGIC_BLUEPRINT_VERSION,
    generated_at: now,
    generation_reason: generationReason,
    source_revision: sourceRevision(items),
    cards,
    generation_stats: {
      total_assets: items.length,
      active_assets: activeItems.length,
      eligible_assets: eligibility.eligibleCount,
      eligibility_updates: eligibility.updated,
      cards_generated: cards.length,
    },
  };

  await db.collection('magic_manifest').updateOne(
    { user_id: userId },
    { $set: manifest, $setOnInsert: { created_at: now } },
    { upsert: true },
  );

  // Generation itself never clears dirty state. A dirty worker acknowledges
  // only the exact dirty revision it claimed; backfill writes only generation
  // metadata. This prevents a mutation that arrives mid-generation from being
  // erased by an older snapshot.
  await db.collection('magic_manifest_state').updateOne(
    { user_id: userId },
    {
      $set: {
        last_generated_at: now,
        blueprint_version: MAGIC_BLUEPRINT_VERSION,
        updated_at: now,
      },
      $setOnInsert: {
        created_at: now,
        dirty: false,
        dirty_revision: 0,
        dirty_reasons: [],
        first_dirty_at: null,
        dirty_at: null,
        lease_until: null,
        lease_owner: null,
      },
    },
    { upsert: true },
  );
  return manifest;
}

function stateReadyForGeneration(state, now, config) {
  if (!state?.dirty) return false;
  const nowMs = dateMs(now);
  const lastGenerated = dateMs(state.last_generated_at);
  if (lastGenerated && nowMs - lastGenerated < config.minIntervalMinutes * 60_000) return false;

  const dirtyAt = dateMs(state.dirty_at);
  const firstDirtyAt = dateMs(state.first_dirty_at) || dirtyAt;
  const quietReached = dirtyAt && nowMs - dirtyAt >= config.quietMinutes * 60_000;
  const maxDelayReached = firstDirtyAt && nowMs - firstDirtyAt >= config.maxDirtyMinutes * 60_000;
  return Boolean(quietReached || maxDelayReached);
}

async function acquireUserLease(db, state, now, config) {
  const owner = crypto.randomUUID();
  const leaseUntil = new Date(new Date(now).getTime() + config.leaseSeconds * 1000);
  const dirtyRevision = Number(state.dirty_revision || 0);
  const result = await db.collection('magic_manifest_state').updateOne(
    {
      user_id: state.user_id,
      dirty: true,
      dirty_revision: dirtyRevision,
      $or: [
        { lease_until: null },
        { lease_until: { $exists: false } },
        { lease_until: { $lte: now } },
      ],
    },
    { $set: { lease_owner: owner, lease_until: leaseUntil, updated_at: now } },
  );
  return result.matchedCount === 1 ? { owner, leaseUntil, dirtyRevision } : null;
}

async function acknowledgeDirtyGeneration(db, userId, lease, now = new Date()) {
  const result = await db.collection('magic_manifest_state').updateOne(
    {
      user_id: userId,
      dirty: true,
      lease_owner: lease.owner,
      dirty_revision: lease.dirtyRevision,
    },
    {
      $set: {
        dirty: false,
        dirty_reasons: [],
        first_dirty_at: null,
        dirty_at: null,
        lease_until: null,
        lease_owner: null,
        updated_at: now,
      },
    },
  );
  return result.matchedCount === 1;
}

async function releaseUserLease(db, userId, owner, now = new Date()) {
  await db.collection('magic_manifest_state').updateOne(
    { user_id: userId, lease_owner: owner },
    { $set: { lease_owner: null, lease_until: null, updated_at: now } },
  );
}

async function processDirtyUsers({ db, now, config, deadline, processedUserIds }) {
  const states = await db.collection('magic_manifest_state')
    .find({ dirty: true })
    .sort({ first_dirty_at: 1, user_id: 1 })
    .limit(config.maxUsersPerRun * 4)
    .toArray();

  let processed = 0;
  for (const state of states) {
    if (processed >= config.maxUsersPerRun || Date.now() >= deadline) break;
    if (!stateReadyForGeneration(state, now, config)) continue;
    const lease = await acquireUserLease(db, state, now, config);
    if (!lease) continue;
    try {
      await generateMagicManifestForUser({
        db,
        userId: state.user_id,
        generationReason: dirtyReasonForManifest(state.dirty_reasons),
        now: new Date(),
        config,
      });
      const acknowledged = await acknowledgeDirtyGeneration(db, state.user_id, lease);
      if (!acknowledged) {
        // A newer mutation incremented dirty_revision while generation was in
        // flight. Drop only our lease and leave dirty=true for the next cycle.
        await releaseUserLease(db, state.user_id, lease.owner).catch(() => {});
      }
      processed += 1;
      processedUserIds.add(String(state.user_id));
    } catch (error) {
      await releaseUserLease(db, state.user_id, lease.owner).catch(() => {});
      console.error('[magic-manifest] dirty-user generation failed', state.user_id, error?.message || error);
    }
  }
  return processed;
}

async function nextBackfillUserIds(db, cursor, limit) {
  const match = { trashed: { $ne: true }, userId: { $type: 'string' } };
  if (cursor) match.userId.$gt = cursor;
  const rows = await db.collection('media').aggregate([
    { $match: match },
    { $group: { _id: '$userId' } },
    { $sort: { _id: 1 } },
    { $limit: Math.max(1, limit) },
  ], { allowDiskUse: true }).toArray();
  return rows.map(row => String(row._id || '')).filter(Boolean);
}

async function processBackfillUsers({ db, now, config, deadline, processedUserIds, remaining }) {
  if (remaining <= 0 || Date.now() >= deadline) return 0;
  const backfills = db.collection('magic_backfill_state');
  const state = await backfills.findOne({ _id: MAGIC_BLUEPRINT_VERSION });
  if (state?.completed === true) return 0;

  const fetchLimit = Math.max(remaining * 3, remaining);
  const ids = await nextBackfillUserIds(db, state?.cursor || '', fetchLimit);
  if (!ids.length) {
    await backfills.updateOne(
      { _id: MAGIC_BLUEPRINT_VERSION },
      { $set: { completed: true, completed_at: now, updated_at: now } },
      { upsert: true },
    );
    return 0;
  }

  let processed = 0;
  let lastCursor = state?.cursor || '';
  let handledFetchedEntries = 0;
  for (const userId of ids) {
    // Never move the cursor onto an entry we did not actually inspect/handle.
    if (processed >= remaining || Date.now() >= deadline) break;

    let handled = false;
    if (processedUserIds.has(userId)) {
      handled = true;
    } else {
      const dirtyState = await db.collection('magic_manifest_state').findOne(
        { user_id: userId },
        { projection: { dirty: 1 } },
      );
      if (dirtyState?.dirty) {
        // Dirty-user processing owns this account; advancing the backfill cursor
        // is safe because the account remains explicitly queued.
        handled = true;
      } else {
        const current = await db.collection('magic_manifest').findOne(
          { user_id: userId },
          { projection: { blueprint_version: 1 } },
        );
        if (current?.blueprint_version === MAGIC_BLUEPRINT_VERSION) {
          handled = true;
        } else {
          try {
            await generateMagicManifestForUser({
              db,
              userId,
              generationReason: current ? 'blueprint_upgrade' : 'initial',
              now: new Date(),
              config,
            });
            processed += 1;
            processedUserIds.add(userId);
            handled = true;
          } catch (error) {
            console.error('[magic-manifest] backfill generation failed', userId, error?.message || error);
            // Keep the cursor before this user so the next run retries it.
            break;
          }
        }
      }
    }

    if (!handled) break;
    lastCursor = userId;
    handledFetchedEntries += 1;
  }

  const exhaustedFetchedBatch = handledFetchedEntries === ids.length;
  const completed = exhaustedFetchedBatch && ids.length < fetchLimit;
  await backfills.updateOne(
    { _id: MAGIC_BLUEPRINT_VERSION },
    {
      $set: {
        cursor: lastCursor,
        completed,
        ...(completed ? { completed_at: new Date() } : {}),
        updated_at: new Date(),
      },
      $setOnInsert: { started_at: now },
      $inc: { processed_count: processed },
    },
    { upsert: true },
  );
  return processed;
}

export async function runMagicManifestWorker({ db, now = new Date(), config = magicManifestConfig() } = {}) {
  if (!db) throw new Error('Magic manifest worker requires db.');
  const started = Date.now();
  const deadline = started + config.safeRuntimeMs;
  const processedUserIds = new Set();

  const dirtyProcessed = await processDirtyUsers({ db, now, config, deadline, processedUserIds });
  const remaining = Math.max(0, config.maxUsersPerRun - dirtyProcessed);
  const backfillProcessed = await processBackfillUsers({
    db,
    now,
    config,
    deadline,
    processedUserIds,
    remaining,
  });

  return {
    processed: dirtyProcessed + backfillProcessed,
    dirtyProcessed,
    backfillProcessed,
    maxUsersPerRun: config.maxUsersPerRun,
    elapsedMs: Date.now() - started,
    blueprintVersion: MAGIC_BLUEPRINT_VERSION,
  };
}

export async function readMagicManifestForUser({ db, userId, now = new Date(), config = magicManifestConfig() } = {}) {
  const manifest = await db.collection('magic_manifest').findOne({ user_id: userId });
  if (!manifest) {
    return filterManifestForDelivery({
      manifest: null,
      existingAssetIds: new Set(),
      faceCardsAllowed: false,
      now,
      minMagicCards: config.minMagicCards,
    });
  }

  const assetIds = [...new Set((manifest.cards || []).flatMap(card => [
    card.cover_asset_id,
    ...(Array.isArray(card.asset_ids) ? card.asset_ids : []),
  ]).map(value => String(value || '')).filter(Boolean))];

  const [existing, user, deletionRequest] = await Promise.all([
    assetIds.length
      ? db.collection('media').find({
        userId,
        id: { $in: assetIds },
        trashed: { $ne: true },
      }).project({ _id: 0, id: 1 }).toArray()
      : [],
    db.collection('users').findOne(
      { id: userId },
      { projection: { cloudFaceRecognitionConsent: 1, faceProcessingConsent: 1 } },
    ),
    db.collection('face_deletion_requests').findOne({ userId }),
  ]);

  const existingAssetIds = new Set(existing.map(item => String(item.id)));
  return filterManifestForDelivery({
    manifest,
    existingAssetIds,
    faceCardsAllowed: faceCardsAllowedForState(user || {}, deletionRequest),
    now,
    minMagicCards: config.minMagicCards,
  });
}

function collectionMatch(type) {
  if (type === 'videos') return { kind: 'video', trashed: { $ne: true } };
  if (type === 'favorites') return { favorite: true, trashed: { $ne: true } };
  if (type === 'screenshots') {
    return {
      kind: 'photo',
      trashed: { $ne: true },
      $or: [
        { userCategory: 'screenshots' },
        { screenshotTypeSource: 'user', userScreenshotType: { $nin: ['', null] } },
        { name: SCREENSHOT_FILENAME_REGEX },
      ],
    };
  }
  return { kind: 'photo', trashed: { $ne: true } };
}

function clean(doc) {
  if (!doc) return doc;
  const { _id, __sortAt, ...rest } = doc;
  return rest;
}

export async function listDeterministicCollection({ db, userId, type = 'photos', limit = 120 } = {}) {
  const normalized = COLLECTION_TYPES.has(String(type)) ? String(type) : 'photos';
  const safeLimit = positiveInt(limit, 120, { min: 1, max: 500 });
  const rows = await db.collection('media').aggregate([
    { $match: { userId, ...collectionMatch(normalized) } },
    {
      $addFields: {
        __sortAt: {
          $ifNull: [
            '$capturedAt',
            { $ifNull: ['$takenAt', { $ifNull: ['$mediaCreatedAt', '$uploadedAt'] }] },
          ],
        },
      },
    },
    { $sort: { __sortAt: -1, id: 1 } },
    { $limit: safeLimit },
  ]).toArray();
  return rows.map(clean);
}

export async function runMagicCoverageQuery(db) {
  const [result] = await db.collection('media').aggregate(buildMagicCoveragePipeline(), { allowDiskUse: true }).toArray();
  return result || { overall: [], perUser: [] };
}

// Exported for focused determinism tests without exposing private internals.
export function deterministicCollectionSort(items = []) {
  return [...items].sort((a, b) => {
    const delta = cardSortTime(b) - cardSortTime(a);
    if (delta !== 0) return delta;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

export { compareCardAssets, deriveMagicEligibility };
