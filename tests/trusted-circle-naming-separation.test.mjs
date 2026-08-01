// "Favourites" used to mean two unrelated things at once: the people you share
// with, and the photos you starred. This test keeps those two concepts apart so
// a future change cannot quietly merge them again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TRUSTED_CIRCLE_ACTIONS,
  TRUSTED_CIRCLE_PERMISSION_KEYS,
  defaultTrustedCirclePermissions,
} from '../lib/trusted-circle/api-contract.js';
import { TRUSTED_PERM_KEYS } from '../lib/trusted-circle/links.js';
import { normalizeMediaFilter } from '../lib/media-library-service.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCANNED_DIRS = ['app', 'lib', 'components', 'hooks'];
const SKIP_DIRS = new Set(['node_modules', '.next', '.git']);

async function collectSourceFiles(dir) {
  const found = [];
  let entries;
  try {
    entries = await readdir(path.join(repoRoot, dir), { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await collectSourceFiles(relative));
    else if (/\.(js|jsx|mjs)$/.test(entry.name)) found.push(relative);
  }
  return found;
}

test('trusted circle owns the people-sharing vocabulary', () => {
  assert.deepEqual(TRUSTED_CIRCLE_ACTIONS, ['accept', 'decline', 'cancel', 'remove', 'block']);
  assert.deepEqual(TRUSTED_CIRCLE_PERMISSION_KEYS, TRUSTED_PERM_KEYS);
  // Automatic future sharing must stay opt-in: adding someone never
  // retroactively opens the rest of the library.
  assert.equal(defaultTrustedCirclePermissions().shareFuturePhotos, false);
});

test('starred photos remain a media filter, not a people concept', () => {
  // `media.favorite` is a per-item bookmark and keeps its own filter name.
  assert.equal(normalizeMediaFilter('favorite'), 'favorite');
  // Trusted-circle words must never be accepted as a library filter.
  assert.equal(normalizeMediaFilter('trusted-circle'), 'all');
  assert.equal(normalizeMediaFilter('trusted'), 'all');
});

test('the ambiguous lib/favorites module is gone and unreferenced', async () => {
  const files = (await Promise.all(SCANNED_DIRS.map(collectSourceFiles))).flat();
  assert.ok(files.length > 100, 'expected to scan a meaningful number of source files');

  const offenders = [];
  for (const relative of files) {
    const source = await readFile(path.join(repoRoot, relative), 'utf8');
    if (/from '@\/lib\/favorites'/.test(source)) offenders.push(relative);
  }
  assert.deepEqual(offenders, [], 'lib/favorites.js was split into lib/trusted-circle/links.js and lib/notify.js');
});

test('no page or API route is served from a /favorites path any more', async () => {
  const files = (await Promise.all(SCANNED_DIRS.map(collectSourceFiles))).flat();
  const apiRoutes = files.filter(file => file.startsWith(path.join('app', 'api', 'favorites')));
  assert.deepEqual(apiRoutes, [], 'the favorites API moved to app/api/trusted-circle');

  // The only survivor is the compatibility redirect for old bookmarks/emails.
  const pageFile = path.join('app', '(app)', 'favorites', 'page.js');
  const redirect = await readFile(path.join(repoRoot, pageFile), 'utf8');
  assert.match(redirect, /redirect\('\/trusted-circle'\)/);
});
