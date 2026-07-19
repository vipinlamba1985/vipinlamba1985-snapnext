import test from 'node:test';
import assert from 'node:assert/strict';
import { safeFaceFocus, sanitizeThumbnailCrop } from '../lib/people-thumbnail.js';

test('small AWS face boxes receive strong safe zoom', () => {
  const focus = safeFaceFocus({ Left: 0.1, Top: 0.2, Width: 0.1, Height: 0.12 });
  assert.ok(focus.automaticZoom > 4);
  assert.equal(focus.objectPosition, '15% 26%');
  assert.equal(focus.transformOrigin, '15% 26%');
});

test('manual thumbnail crop values are safely bounded', () => {
  assert.deepEqual(sanitizeThumbnailCrop({ x: 200, y: -200, zoom: 9 }), {
    x: 45,
    y: -45,
    zoom: 2.25,
  });
});

test('manual zoom multiplies automatic face focus within the safety cap', () => {
  const automatic = safeFaceFocus({ Left: 0.4, Top: 0.3, Width: 0.2, Height: 0.2 });
  const edited = safeFaceFocus(
    { Left: 0.4, Top: 0.3, Width: 0.2, Height: 0.2 },
    { zoom: 2 },
  );
  assert.equal(edited.zoom, Math.min(8, automatic.zoom * 2));
});

test('manual movement keeps the CSS focus point inside the image', () => {
  const focus = safeFaceFocus(
    { Left: 0.95, Top: 0.95, Width: 0.05, Height: 0.05 },
    { x: 45, y: 45, zoom: 1 },
  );
  assert.ok(focus.center.x >= 0 && focus.center.x <= 100);
  assert.ok(focus.center.y >= 0 && focus.center.y <= 100);
  assert.ok(focus.zoom >= 1);
});
