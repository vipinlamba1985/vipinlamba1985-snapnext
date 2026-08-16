import test from 'node:test';
import assert from 'node:assert/strict';
import { renderQuotaDecision, renderQuotaForPlan, renderQuotaPeriod } from '../lib/create-render-quota.js';
import {
  CREATE_PLAN_INCLUDED_COPY,
  EXTERNAL_EXPORT_DELETION_NOTICE,
  canonicalRenderUsageCopy,
  exportedCopyIsSnapNextControlled,
} from '../lib/create-export-policy.js';
import {
  FREE_STORY_AUDIO_TRACKS,
  soundtrackCanBeEmbedded,
  soundtrackLicenseSnapshot,
} from '../lib/ready-story-audio.js';

test('canonical Reel render quotas are plan bounded', () => {
  assert.equal(renderQuotaForPlan('free'), 1);
  assert.equal(renderQuotaForPlan('starter'), 3);
  assert.equal(renderQuotaForPlan('plus'), 10);
  assert.equal(renderQuotaForPlan('pro'), 30);
  assert.equal(renderQuotaForPlan('family'), 50);
  assert.equal(renderQuotaForPlan('super_user'), Number.MAX_SAFE_INTEGER);
});

test('quota decision includes active reservations so concurrent renders cannot exceed plan limit', () => {
  assert.deepEqual(renderQuotaDecision({ used: 1, reserved: 1, limit: 3 }), {
    allowed: true,
    used: 1,
    reserved: 1,
    committed: 2,
    limit: 3,
    remaining: 1,
  });
  assert.equal(renderQuotaDecision({ used: 2, reserved: 1, limit: 3 }).allowed, false);
});

test('render quota periods are UTC calendar months', () => {
  const period = renderQuotaPeriod(new Date('2026-08-31T23:59:59.000Z'));
  assert.equal(period.key, '2026-08');
  assert.equal(period.start.toISOString(), '2026-08-01T00:00:00.000Z');
  assert.equal(period.end.toISOString(), '2026-09-01T00:00:00.000Z');
});

test('Create billing copy stays credit-neutral in V2.1', () => {
  assert.equal(CREATE_PLAN_INCLUDED_COPY, 'Included with your plan');
  assert.equal(canonicalRenderUsageCopy({ used: 1, limit: 3 }), '1 of 3 Reel exports used this month');
  assert.doesNotMatch(`${CREATE_PLAN_INCLUDED_COPY} ${canonicalRenderUsageCopy({ used: 1, limit: 3 })}`, /SnapNext Credits/i);
});

test('export boundary explicitly excludes external copies from SnapNext deletion control', () => {
  assert.match(EXTERNAL_EXPORT_DELETION_NOTICE, /outside SnapNext/i);
  assert.match(EXTERNAL_EXPORT_DELETION_NOTICE, /cannot be deleted by SnapNext/i);
  assert.equal(exportedCopyIsSnapNextControlled({ destination: 'snapnext' }), true);
  assert.equal(exportedCopyIsSnapNextControlled({ destination: 'camera-roll' }), false);
  assert.equal(exportedCopyIsSnapNextControlled({ destination: 'whatsapp' }), false);
});

test('only explicitly embeddable soundtrack licenses are eligible for exported video', () => {
  const track = FREE_STORY_AUDIO_TRACKS[0];
  assert.equal(soundtrackCanBeEmbedded(track), true);
  assert.equal(track.license, 'CC0-1.0');
  assert.equal(track.embeddedExportAllowed, true);
  assert.equal(track.derivativeSyncAllowed, true);
  assert.match(soundtrackLicenseSnapshot(track), /CC0-1\.0/);

  assert.equal(soundtrackCanBeEmbedded({
    commercialUseAllowed: true,
    embeddedExportAllowed: false,
    derivativeSyncAllowed: true,
    variableLicenseCostUsd: 0,
  }), false);
});
