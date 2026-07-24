import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('Magic Library global search queries the authenticated media API', async () => {
  const hook = await source('components/magic-library/useMagicLibrary.js');
  assert.match(hook, /apiFetch\(`\/media\?q=\$\{encodeURIComponent\(normalized\)\}`\)/);
  assert.match(hook, /setSearchBusy\(true\)/);
  assert.match(hook, /setSearchError/);
  assert.match(hook, /if \(query\) return searchItems/);
});

test('Magic Library Search clears person scope for normal library queries', async () => {
  const gallery = await source('components/magic-library/MagicLibraryGalleryMagic.js');
  assert.match(gallery, /magic\.setActivePerson\(''\);\s*magic\.setQuery\(next\)/);
  assert.match(gallery, /Search people, places, objects, or text/);
  assert.match(gallery, /Searching your full library/);
  assert.match(gallery, /memories.*found for/);
});

test('exact person-name searches open the person instead of text-searching a display label', async () => {
  const gallery = await source('components/magic-library/MagicLibraryGalleryMagic.js');
  assert.match(gallery, /displayName\(person\.name\)\.toLowerCase\(\) === next\.toLowerCase\(\)/);
  assert.match(gallery, /magic\.activation\.enabled\?\.includes\?\.\(personMatch\.name\)/);
  assert.match(gallery, /magic\.setActivePerson\(personMatch\.name\)/);
});

test('server-side media search covers user labels and AI metadata used by Magic Library', async () => {
  const service = await source('lib/media-library-service.js');
  for (const field of [
    'userCategory',
    'userTags',
    'people_tags',
    'aiAnalysis.caption',
    'aiAnalysis.description',
    'aiAnalysis.tags',
    'aiAnalysis.locations',
    'aiAnalysis.contentType',
    'aiAnalysis.textInside',
  ]) {
    assert.match(service, new RegExp(`['"]${field.replaceAll('.', '\\.') }['"]`));
  }
  assert.match(service, /mongoQuery\.\$or = searchable\.map/);
  assert.match(service, /userId/);
});
