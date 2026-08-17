import test from 'node:test';
import assert from 'node:assert/strict';
import { settleCanonicalRenderQuota } from '../lib/create-render-quota.js';
import {
  canonicalRenderAccountingComplete,
  canonicalRenderAccountingCost,
} from '../lib/create-render-accounting.server.js';

function quotaDb({ reservationStatus = 'reserved', usageSettled = false } = {}) {
  const reservation = {
    id: 'reservation-1',
    usageId: 'user-1:2026-08',
    status: reservationStatus,
  };
  const usage = {
    _id: reservation.usageId,
    used: usageSettled ? 1 : 0,
    reserved: usageSettled ? 0 : 1,
    settledReservationIds: usageSettled ? [reservation.id] : [],
  };

  function matchesStatus(filter, row) {
    return !filter.status || filter.status === row.status;
  }

  return {
    state: { reservation, usage },
    collection(name) {
      if (name === 'render_quota_reservations') {
        return {
          async findOne(filter) {
            return filter.id === reservation.id ? { ...reservation } : null;
          },
          async findOneAndUpdate(filter, update, options = {}) {
            if (filter.id !== reservation.id || !matchesStatus(filter, reservation)) return null;
            const before = { ...reservation };
            Object.assign(reservation, update.$set || {});
            return options.returnDocument === 'before' ? before : { ...reservation };
          },
          async updateOne(filter, update) {
            if (filter.id !== reservation.id || !matchesStatus(filter, reservation)) return { matchedCount: 0 };
            Object.assign(reservation, update.$set || {});
            return { matchedCount: 1 };
          },
        };
      }
      if (name === 'render_quota_usage') {
        return {
          async findOne(filter) {
            return filter._id === usage._id ? { ...usage, settledReservationIds: [...usage.settledReservationIds] } : null;
          },
          async updateOne(filter, update) {
            if (filter._id !== usage._id) return { matchedCount: 0 };
            if (filter.reserved?.$gt !== undefined && !(usage.reserved > filter.reserved.$gt)) return { matchedCount: 0 };
            const excluded = filter.settledReservationIds?.$ne;
            if (excluded && usage.settledReservationIds.includes(excluded)) return { matchedCount: 0 };
            if (update.$inc) {
              usage.used += Number(update.$inc.used || 0);
              usage.reserved += Number(update.$inc.reserved || 0);
            }
            if (update.$addToSet?.settledReservationIds && !usage.settledReservationIds.includes(update.$addToSet.settledReservationIds)) {
              usage.settledReservationIds.push(update.$addToSet.settledReservationIds);
            }
            return { matchedCount: 1 };
          },
        };
      }
      throw new Error(`Unexpected collection ${name}`);
    },
  };
}

test('successful Reel accounting is not complete until both durable markers exist', () => {
  assert.equal(canonicalRenderAccountingComplete({ status: 'ready' }), false);
  assert.equal(canonicalRenderAccountingComplete({
    status: 'ready',
    quotaConsumedAt: new Date(),
    costSettledAt: new Date(),
  }), true);
  assert.equal(canonicalRenderAccountingComplete({
    status: 'pending_validation',
    quotaConsumedAt: new Date(),
    costSettledAt: new Date(),
  }), false);
});

test('missing actual cost falls back to the remembered or estimated successful-render cost', () => {
  assert.equal(canonicalRenderAccountingCost({ estimatedRenderCostUsd: 0.08 }, null), 0.08);
  assert.equal(canonicalRenderAccountingCost({ pendingActualRenderCostUsd: 0.06, estimatedRenderCostUsd: 0.08 }, null), 0.06);
  assert.equal(canonicalRenderAccountingCost({ pendingActualRenderCostUsd: 0.06 }, 0.05), 0.05);
});

test('render quota settlement is idempotent across normal callback retries', async () => {
  const db = quotaDb();
  const first = await settleCanonicalRenderQuota({ db, reservationId: 'reservation-1', artifactId: 'artifact-1' });
  const second = await settleCanonicalRenderQuota({ db, reservationId: 'reservation-1', artifactId: 'artifact-1' });
  assert.equal(first.settled, true);
  assert.equal(second.settled, true);
  assert.equal(second.idempotent, true);
  assert.equal(db.state.usage.used, 1);
  assert.equal(db.state.usage.reserved, 0);
  assert.deepEqual(db.state.usage.settledReservationIds, ['reservation-1']);
  assert.equal(db.state.reservation.status, 'settled');
});

test('render quota settlement resumes safely after a crash while reservation is settling', async () => {
  const beforeUsageWrite = quotaDb({ reservationStatus: 'settling', usageSettled: false });
  const resumed = await settleCanonicalRenderQuota({ db: beforeUsageWrite, reservationId: 'reservation-1', artifactId: 'artifact-1' });
  assert.equal(resumed.settled, true);
  assert.equal(beforeUsageWrite.state.usage.used, 1);
  assert.equal(beforeUsageWrite.state.usage.reserved, 0);
  assert.equal(beforeUsageWrite.state.reservation.status, 'settled');

  const afterUsageWrite = quotaDb({ reservationStatus: 'settling', usageSettled: true });
  const completed = await settleCanonicalRenderQuota({ db: afterUsageWrite, reservationId: 'reservation-1', artifactId: 'artifact-1' });
  assert.equal(completed.settled, true);
  assert.equal(afterUsageWrite.state.usage.used, 1);
  assert.equal(afterUsageWrite.state.usage.reserved, 0);
  assert.equal(afterUsageWrite.state.reservation.status, 'settled');
});
