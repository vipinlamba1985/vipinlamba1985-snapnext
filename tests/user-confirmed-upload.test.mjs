import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MAX_USER_CONFIRMED_PEOPLE,
  UserConfirmedPeopleError,
  confirmedPersonIds,
  loadActivatedPersonAssignments,
  parseAssignedPersonClusterIds,
  personMembershipQuery,
} from '../lib/user-confirmed-people.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(repoRoot, file), 'utf8');

test('manual upload assignments are bounded, deduplicated and opaque', () => {
  assert.deepEqual(parseAssignedPersonClusterIds([' cluster-a ', 'cluster-a', 'cluster-b']), ['cluster-a', 'cluster-b']);
  assert.throws(
    () => parseAssignedPersonClusterIds(Array.from({ length: MAX_USER_CONFIRMED_PEOPLE + 1 }, (_, index) => `p-${index}`)),
    error => error instanceof UserConfirmedPeopleError && error.code === 'person_assignment_limit',
  );
  assert.throws(() => parseAssignedPersonClusterIds('cluster-a'), UserConfirmedPeopleError);
});

test('only valid activated people can be assigned', async () => {
  const collections = {
    magic_library_activation: {
      findOne: async () => ({ active: ['self', 'family'] }),
    },
    person_clusters: {
      find: query => ({
        project: () => ({
          toArray: async () => [
            { clusterId: 'self', isSelf: true, status: 'confirmed', identityState: 'person' },
            { clusterId: 'family', displayName: 'Sarika', status: 'confirmed', identityState: 'person' },
          ].filter(row => query.clusterId.$in.includes(row.clusterId)),
        }),
      }),
    },
  };
  const db = { collection: name => collections[name] };
  const resolved = await loadActivatedPersonAssignments({ db, userId: 'u1', clusterIds: ['self', 'family'] });
  assert.deepEqual(resolved.get('self'), { clusterId: 'self', displayName: 'You' });
  assert.deepEqual(resolved.get('family'), { clusterId: 'family', displayName: 'Sarika' });

  await assert.rejects(
    loadActivatedPersonAssignments({ db, userId: 'u1', clusterIds: ['not-active'] }),
    error => error instanceof UserConfirmedPeopleError && error.code === 'person_assignment_not_active',
  );
});

test('manual and AI membership are queried separately and deduplicated by Mongo', () => {
  assert.deepEqual(personMembershipQuery('u1', 'p1'), {
    userId: 'u1',
    trashed: { $ne: true },
    $or: [
      { 'peopleIntelligence.clusterIds': 'p1' },
      { 'userConfirmedPeople.clusterId': 'p1' },
    ],
  });
  assert.deepEqual(confirmedPersonIds({ userConfirmedPeople: [{ clusterId: 'p1' }, { clusterId: 'p1' }, { clusterId: 'p2' }] }), ['p1', 'p2']);
});

test('the visible upload flow has one review confirmation, not the old planning maze', async () => {
  const discovery = await read(path.join('app', '(app)', 'upload', 'discover', 'DiscoveryFlow.js'));
  assert.doesNotMatch(discovery, /Build My Protection Plan|Protect These Memories|Choose What to Protect/);
  assert.doesNotMatch(discovery, /stage === 'report'|stage === 'priority'/);
  assert.match(discovery, /Back up \{readyCount/);
  assert.match(discovery, /does not train face recognition/);
  assert.match(discovery, /Unlimited storage available/);
});

test('manual assignment is stored outside AI recognition and can be removed', async () => {
  const commit = await read(path.join('lib', 'protection-commit.js'));
  const preflight = await read(path.join('lib', 'protection-preflight.js'));
  const organize = await read(path.join('app', 'api', 'media', '[id]', 'organize', 'route.js'));
  const personRoute = await read(path.join('app', 'api', 'magic-library', 'people', '[clusterId]', 'media', 'route.js'));
  assert.match(commit, /userConfirmedPeople/);
  assert.match(commit, /source: 'upload_assignment'/);
  assert.doesNotMatch(commit, /peopleIntelligence:\s*\{[\s\S]*assignedPeople/);
  assert.match(preflight, /assignmentUpdated/);
  assert.match(preflight, /'userConfirmedPeople.clusterId': \{ \$ne: person.clusterId \}/);
  assert.match(organize, /removeConfirmedPersonClusterId/);
  assert.match(organize, /\$pull/);
  assert.match(personRoute, /personMembershipQuery/);
});

test('direct upload failure cannot silently fall back into a large 413 request', async () => {
  const upload = await read(path.join('lib', 'protection-upload-one.js'));
  assert.match(upload, /SAFE_SERVER_FALLBACK_BYTES/);
  assert.match(upload, /direct_upload_required/);
  assert.match(upload, /it was not sent through the size-limited server route/);
});

test('activated person thumbnails provide a preselected add-photos path', async () => {
  const shortcuts = await read(path.join('components', 'magic-library', 'PersonUploadShortcuts.js'));
  const discoveryHook = await read(path.join('components', 'protection', 'useDiscoveryFlow.js'));
  assert.match(shortcuts, /\/upload\/discover\?person=/);
  assert.match(shortcuts, /Add photos/);
  assert.match(discoveryHook, /assignedPersonClusterIds/);
  assert.match(discoveryHook, /new URLSearchParams\(window\.location\.search\)/);
});
