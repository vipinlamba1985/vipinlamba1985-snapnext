import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  clearLibraryRefreshListeners,
  publishLibraryRefresh,
  subscribeLibraryRefresh,
} from '../lib/library-refresh.js';

const read = (path) => fs.readFileSync(path, 'utf8');

/** Client surfaces that participate in upload / People organizing. */
const PROCESSING_SOURCES = [
  'app/(app)/upload/page.js',
  'components/magic-library/PeopleMagicBootstrap.js',
  'components/magic-library/PeopleRow.js',
  'components/magic-library/RecoverPeopleDialog.js',
  'components/magic-library/LockedPersonPrompt.js',
  'components/magic-library/useMagicLibrary.js',
];

test('no processing path reloads the page to show progress', () => {
  for (const path of PROCESSING_SOURCES) {
    assert.doesNotMatch(
      read(path),
      /location\s*\.\s*reload/,
      `${path} must refresh state in place instead of reloading the page`,
    );
  }
});

test('progress is delivered through the in-place refresh signal', () => {
  assert.match(read('components/magic-library/PeopleMagicBootstrap.js'), /publishLibraryRefresh/);
  // The data owner listens, so the gallery updates without a reload.
  assert.match(read('components/magic-library/useMagicLibrary.js'), /subscribeLibraryRefresh/);
});

test('the refresh signal reaches every subscriber and can be unsubscribed', () => {
  clearLibraryRefreshListeners();
  const seen = [];
  const stop = subscribeLibraryRefresh((detail) => seen.push(detail.source));
  subscribeLibraryRefresh((detail) => seen.push(`second:${detail.source}`));

  publishLibraryRefresh({ source: 'people-migration' });
  assert.deepEqual(seen, ['people-migration', 'second:people-migration']);

  stop();
  publishLibraryRefresh({ source: 'again' });
  assert.deepEqual(seen, ['people-migration', 'second:people-migration', 'second:again']);
  clearLibraryRefreshListeners();
});

test('one failing subscriber does not block the others', () => {
  clearLibraryRefreshListeners();
  const seen = [];
  subscribeLibraryRefresh(() => { throw new Error('subscriber exploded'); });
  subscribeLibraryRefresh(() => seen.push('ran'));
  publishLibraryRefresh({ source: 'test' });
  assert.deepEqual(seen, ['ran']);
  clearLibraryRefreshListeners();
});

test('a status read never triggers work', () => {
  const route = read('app/api/magic-library/people/reindex/route.js');
  const getStart = route.indexOf('export async function GET');
  const postStart = route.indexOf('export async function POST');
  assert.ok(getStart > 0 && postStart > getStart);

  const getBody = route.slice(getStart, postStart);
  // The read path may only report status; indexing belongs to POST alone.
  assert.doesNotMatch(getBody, /rebuildPeopleIntelligence|rebuildFavoritePeopleRecognition/);
  assert.doesNotMatch(getBody, /updateMany|updateOne/);
  assert.match(getBody, /getStatus\(db, user\.id\)/);
});

test('failed People work is only re-queued by an explicit retry request', () => {
  const route = read('app/api/magic-library/people/reindex/route.js');
  // The only path that flips 'failed' back to 'queued' is gated on retryFailed.
  assert.match(route, /if \(body\.retryFailed === true\)[\s\S]*?db\.collection\('media'\)\.updateMany\(/);

  const bootstrap = read('components/magic-library/PeopleMagicBootstrap.js');
  // retryFailed is a parameter, defaulting to false, and only the first batch
  // of an explicitly-requested retry may set it.
  assert.match(bootstrap, /retryFailed: retryFailed && batch === 0/);
  assert.match(bootstrap, /\{ automatic = false, retryFailed = false \} = \{\}/);
  // The unattended pass passes only `automatic`, so retryFailed stays false.
  assert.match(bootstrap, /runMigration\(\{ automatic: true \}\)/);
  // The only caller that requests a retry is the user-facing Retry button.
  const retryCallers = bootstrap.match(/runMigration\(\{[^}]*retryFailed: true[^}]*\}\)/g) || [];
  assert.equal(retryCallers.length, 1, 'exactly one explicit retry entry point');
  assert.match(bootstrap, /onClick=\{\(\) => runMigration\(\{ retryFailed: true \}\)\}/);
});

test('the automatic People pass cannot re-arm itself after it stops', () => {
  const bootstrap = read('components/magic-library/PeopleMagicBootstrap.js');
  // Held in a ref so a re-render or a refetch cannot reset the guard.
  assert.match(bootstrap, /const automaticExhausted = useRef\(false\)/);
  assert.match(bootstrap, /exhausted: automaticExhausted\.current/);
  assert.match(bootstrap, /automaticExhausted\.current = true/);
  // A concurrent run guard that does not depend on async state updates.
  assert.match(bootstrap, /const runningRef = useRef\(false\)/);
  assert.match(bootstrap, /if \(runningRef\.current\) return/);
});

test('upload cannot start twice from a stale state check', () => {
  const upload = read('app/(app)/upload/page.js');
  assert.match(upload, /const uploadingRef = useRef\(false\)/);
  assert.match(upload, /if \(uploadingRef\.current\) return/);
});

test('upload selection rules are centralised, not re-derived inline', () => {
  const upload = read('app/(app)/upload/page.js');
  assert.match(upload, /selectAutomaticUploadItems/);
  assert.match(upload, /selectManualRetryItems/);
  // The old selector silently included failed items in every run.
  assert.doesNotMatch(upload, /\['queued', 'error'\]\.includes/);
});
