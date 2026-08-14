import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Which photo is you is explicit, bounded and filters non-photo representatives', async () => {
  const picker = await read('components/magic-library/SelfPersonPicker.js');
  const gallery = await read('components/magic-library/MagicLibraryGalleryMagic.js');

  assert.match(picker, /INITIAL_CANDIDATES = 5/);
  assert.match(picker, /MAX_CANDIDATES = 20/);
  assert.match(picker, /Which photo is you\?/);
  assert.match(picker, /Yes, that's me/);
  assert.match(picker, /None of these \/ later/);
  assert.match(picker, /mediaCategory\(representative\) !== 'photos'/);
  assert.match(picker, /\/magic-library\/people\/self/);
  assert.match(gallery, /SelfPersonPicker/);
});

test('self confirmation is user scoped and never turns into a cloud identity call', async () => {
  const route = await read('app/api/magic-library/people/self/route.js');

  assert.match(route, /getUserFromRequest/);
  assert.match(route, /userId: user\.id/);
  assert.match(route, /selfConfirmationSource: 'user_explicit_picker'/);
  assert.match(route, /mediaCategory\(representative\) !== 'photos'/);
  assert.match(route, /cloudRecognitionChanged: false/);
  assert.match(route, /autoShare: false/);
  assert.doesNotMatch(route, /favorite-people-recognition|runAiTask|generateContent|searchUsersByImage|indexFaces|associateFaces/i);
});

test('confirmed people get evidence-based memory sections instead of a flat photo wall', async () => {
  const sections = await read('lib/magic-library-sections.js');

  assert.match(sections, /You over the years/);
  assert.match(sections, /You \+ \$\{label\}/);
  assert.match(sections, /birthdays & celebrations/);
  assert.match(sections, /trips & places/);
  assert.match(sections, /section\.items\.length > 0/);
});
