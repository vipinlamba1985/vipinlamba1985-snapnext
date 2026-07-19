import test from 'node:test';
import assert from 'node:assert/strict';
import { automaticFaceFocus, sanitizeThumbnailCrop } from '../lib/people-thumbnail.js';

test('small AWS face boxes receive a strong automatic zoom', () => {
  const focus = automaticFaceFocus({ Left: 0.1, Top: 0.2, Width: 0.1, Height: 0.12 });
  assert.ok(focus.automaticZoom >= 5);
  assert.equal(focus.objectPosition, '15.000000000000002% 26%');
});

test('manual thumbnail crop values are safely bounded', () => {
  assert.deepEqual(sanitizeThumbnailCrop({ x: 200, y: -200, zoom: 9 }), {
    x: 45,
    y: -45,
    zoom: 2.25,
  });
});

test('manual zoom multiplies automatic focus without exceeding the safety cap', () => {
  const focus = automaticFaceFocus(
    { Left: 0.4, Top: 0.3, Width: 0.08, Height: 0.08 },
    { x: 0, y: 0, zoom: 2.25 },
  );
  assert.equal(focus.zoom, 8);
});
