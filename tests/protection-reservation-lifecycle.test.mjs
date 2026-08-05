import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ProtectionPreparationCancelledError,
  reservationIdsFromDecisions,
  runProtectionDecisionBatches,
} from '../lib/protection-decision-batches.js';
import { ProtectionPreparationRegistry } from '../lib/protection-preparation.js';
import {
  cleanupExpiredReservations,
  releaseReservation,
  releaseReservations,
  reserveUploadBytes,
} from '../lib/protection-reservations.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFile(path.join(repoRoot, file), 'utf8');

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function matches(doc, query = {}) {
  return Object.entries(query).every(([key, expected]) => {
    const actual = doc?.[key];
    if (expected && typeof expected === 'object' && !Array.isArray(expected) && !(expected instanceof Date)) {
      if ('$lte' in expected && !(actual <= expected.$lte)) return false;
      if ('$lt' in expected && !(actual < expected.$lt)) return false;
      if ('$gte' in expected && !(actual >= expected.$gte)) return false;
      if ('$gt' in expected && !(actual > expected.$gt)) return false;
      if ('$in' in expected && !expected.$in.includes(actual)) return false;
      return true;
    }
    return actual === expected;
  });
}

function applyUpdate(doc, update, inserting = false) {
  if (inserting && update.$setOnInsert) Object.assign(doc, clone(update.$setOnInsert));
  if (update.$set) Object.assign(doc, clone(update.$set));
  if (update.$inc) {
    for (const [key, amount] of Object.entries(update.$inc)) doc[key] = Number(doc[key] || 0) + amount;
  }
}

function memoryDb(seed = {}) {
  const stores = new Map(Object.entries(seed).map(([name, rows]) => [name, rows.map(clone)]));
  const failInsert = new Set();
  const collection = (name) => {
    if (!stores.has(name)) stores.set(name, []);
    const rows = stores.get(name);
    return {
      find(query) {
        return { toArray: async () => rows.filter((row) => matches(row, query)).map(clone) };
      },
      async findOneAndUpdate(query, update, options = {}) {
        const index = rows.findIndex((row) => matches(row, query));
        if (index < 0) return null;
        const before = clone(rows[index]);
        applyUpdate(rows[index], update);
        return options.returnDocument === 'before' ? before : clone(rows[index]);
      },
      async updateOne(query, update, options = {}) {
        let index = rows.findIndex((row) => matches(row, query));
        let inserted = false;
        if (index < 0 && options.upsert) {
          rows.push({});
          index = rows.length - 1;
          inserted = true;
        }
        if (index < 0) return { matchedCount: 0, modifiedCount: 0 };
        applyUpdate(rows[index], update, inserted);
        return { matchedCount: inserted ? 0 : 1, modifiedCount: 1, upsertedCount: inserted ? 1 : 0 };
      },
      async insertOne(doc) {
        if (failInsert.has(name)) {
          failInsert.delete(name);
          throw new Error(`forced ${name} insert failure`);
        }
        rows.push(clone(doc));
        return { insertedId: doc.id };
      },
      rows,
    };
  };
  return {
    collection,
    failNextInsert(name) { failInsert.add(name); },
    rows(name) { return collection(name).rows; },
  };
}

const accepted = (id, localId = id) => ({ localId, decision: 'ACCEPT', reservationId: id });

test('only ACCEPT decisions expose live reservation ids, deduplicated', () => {
  assert.deepEqual(reservationIdsFromDecisions([
    accepted('r1'),
    { decision: 'SKIP_DUPLICATE' },
    accepted('r1'),
    accepted('r2'),
    { decision: 'ACCEPT' },
  ]), ['r1', 'r2']);
});

test('a later preflight batch failure releases reservations from earlier batches', async () => {
  const released = [];
  let calls = 0;
  await assert.rejects(
    runProtectionDecisionBatches([1, 2, 3], {
      batchSize: 2,
      fetchBatch: async () => {
        calls += 1;
        if (calls === 1) return { decisions: [accepted('r1'), accepted('r2')] };
        throw new Error('batch two failed');
      },
      releaseReservations: async (ids) => {
        released.push(...ids);
        return { failedIds: [] };
      },
    }),
    /batch two failed/,
  );
  assert.deepEqual(released, ['r1', 'r2']);
});

test('a stale response records then releases the reservations it created', async () => {
  let current = true;
  const released = [];
  await assert.rejects(
    runProtectionDecisionBatches([1], {
      fetchBatch: async () => {
        current = false;
        return { decisions: [accepted('stale-r')] };
      },
      isCurrent: () => current,
      releaseReservations: async (ids, options) => {
        released.push({ ids, reason: options.reason });
        return { failedIds: [] };
      },
    }),
    (error) => error instanceof ProtectionPreparationCancelledError,
  );
  assert.deepEqual(released, [{ ids: ['stale-r'], reason: 'stale_preflight' }]);
});

test('the registry prevents stale cleanup cancelling the current queue', () => {
  const registry = new ProtectionPreparationRegistry();
  const first = registry.currentGeneration();
  registry.recordDecisions(first, [accepted('old')]);
  const second = registry.advanceGeneration();
  registry.recordDecisions(second, [accepted('new')]);

  assert.equal(registry.isCurrent(first), false);
  assert.equal(registry.isCurrent(second), true);
  const handed = registry.handoff(second, [accepted('new')]);
  assert.deepEqual(handed, ['new']);
  assert.deepEqual(registry.allPreparedIds(), ['old']);
  assert.deepEqual(registry.queueOwnedIds(), ['new']);

  registry.markReleasedEverywhere(['old']);
  assert.deepEqual(registry.allPreparedIds(), []);
  assert.deepEqual(registry.queueOwnedIds(), ['new']);
});

test('release is ownership-bound and idempotent', async () => {
  const db = memoryDb({
    upload_reservations: [{ id: 'r1', userId: 'alice', bytes: 40, status: 'reserved', expiresAt: new Date(Date.now() + 60_000) }],
    upload_quota_ledgers: [{ userId: 'alice', reservedBytes: 40 }],
  });

  assert.equal(await releaseReservation(db, 'r1', 'cancelled', { userId: 'bob' }), null);
  assert.equal(db.rows('upload_quota_ledgers')[0].reservedBytes, 40);
  const released = await releaseReservation(db, 'r1', 'cancelled', { userId: 'alice' });
  assert.equal(released.id, 'r1');
  assert.equal(db.rows('upload_quota_ledgers')[0].reservedBytes, 0);
  assert.equal(await releaseReservation(db, 'r1', 'cancelled', { userId: 'alice' }), null);
});

test('bulk release deduplicates ids and cannot release another user reservation', async () => {
  const db = memoryDb({
    upload_reservations: [
      { id: 'a', userId: 'alice', bytes: 10, status: 'reserved' },
      { id: 'b', userId: 'bob', bytes: 20, status: 'reserved' },
    ],
    upload_quota_ledgers: [
      { userId: 'alice', reservedBytes: 10 },
      { userId: 'bob', reservedBytes: 20 },
    ],
  });
  const result = await releaseReservations(db, { reservationIds: ['a', 'a', 'b'], userId: 'alice', status: 'selection_replaced' });
  assert.deepEqual(result.releasedIds, ['a']);
  assert.deepEqual(result.ignoredIds, ['b']);
  assert.equal(db.rows('upload_reservations').find((row) => row.id === 'b').status, 'reserved');
});

test('expired reservations are reclaimed before a new quota decision', async () => {
  const db = memoryDb({
    upload_reservations: [{ id: 'old', userId: 'alice', bytes: 80, status: 'reserved', expiresAt: new Date(Date.now() - 1_000) }],
    upload_quota_ledgers: [{ userId: 'alice', reservedBytes: 80 }],
  });
  const reservation = await reserveUploadBytes({
    db,
    userId: 'alice',
    planLimitBytes: 100,
    usedBytes: 0,
    bytes: 50,
    metadata: { localId: 'new' },
  });
  assert.ok(reservation);
  assert.equal(db.rows('upload_reservations').find((row) => row.id === 'old').status, 'expired');
  assert.equal(db.rows('upload_quota_ledgers')[0].reservedBytes, 50);
});

test('active reservations still reduce available quota', async () => {
  const db = memoryDb({
    upload_reservations: [{ id: 'active', userId: 'alice', bytes: 80, status: 'reserved', expiresAt: new Date(Date.now() + 60_000) }],
    upload_quota_ledgers: [{ userId: 'alice', reservedBytes: 80 }],
  });
  const reservation = await reserveUploadBytes({
    db,
    userId: 'alice',
    planLimitBytes: 100,
    usedBytes: 0,
    bytes: 50,
    metadata: {},
  });
  assert.equal(reservation, null);
});

test('a reservation-row insert failure compensates the quota ledger', async () => {
  const db = memoryDb({ upload_quota_ledgers: [{ userId: 'alice', reservedBytes: 0 }] });
  db.failNextInsert('upload_reservations');
  await assert.rejects(reserveUploadBytes({
    db,
    userId: 'alice',
    planLimitBytes: 100,
    usedBytes: 0,
    bytes: 25,
    metadata: {},
  }), /forced upload_reservations insert failure/);
  assert.equal(db.rows('upload_quota_ledgers')[0].reservedBytes, 0);
});

test('expired cleanup is idempotent', async () => {
  const db = memoryDb({
    upload_reservations: [{ id: 'old', userId: 'alice', bytes: 30, status: 'reserved', expiresAt: new Date(Date.now() - 1_000) }],
    upload_quota_ledgers: [{ userId: 'alice', reservedBytes: 30 }],
  });
  assert.equal(await cleanupExpiredReservations(db, 'alice'), 30);
  assert.equal(await cleanupExpiredReservations(db, 'alice'), 0);
});

test('the simplified flow checks before review and uploads only after one confirmation', async () => {
  const discovery = await read(path.join('app', '(app)', 'upload', 'discover', 'DiscoveryFlow.js'));
  const hook = await read(path.join('components', 'protection', 'useDiscoveryFlow.js'));

  for (const state of ['welcome', 'checking', 'review', 'protecting', 'results']) {
    assert.match(discovery + hook, new RegExp(`['\"]${state}['\"]`));
  }
  assert.doesNotMatch(discovery, /Build My Protection Plan|Protect These Memories|Choose What to Protect/);
  assert.doesNotMatch(discovery + hook, /stage === 'report'|stage === 'priority'|stage === 'person'|stage === 'together'/);
  assert.match(discovery, /Nothing has uploaded yet/);
  assert.match(hook, /pagehide/);
  assert.match(hook, /advanceGeneration/);
  assert.match(hook, /releaseAllPrepared/);
  assert.match(hook, /handoffPreparedReservations/);

  const preflightIndex = hook.indexOf('requestProtectionDecisions(prepared');
  const reviewIndex = hook.indexOf("setStage('review')", preflightIndex);
  assert.ok(preflightIndex >= 0 && reviewIndex > preflightIndex, 'server decisions must finish before review');
  assert.doesNotMatch(hook, /runProtectionQueue|uploadProtectedDirect|uploadProtectedViaServer/);
  assert.match(discovery, /runProtectionQueue/);
});
