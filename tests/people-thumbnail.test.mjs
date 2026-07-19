import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFaceCropLayout, sanitizeThumbnailCrop } from '../lib/people-thumbnail.js';

function closeTo(actual, expected, tolerance = 0.001) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be close to ${expected}`);
}

test('small AWS face boxes are enlarged and centered in the card', () => {
  const faceBox = { Left: 0.1, Top: 0.2, Width: 0.1, Height: 0.12 };
  const layout = calculateFaceCropLayout({
    faceBox,
    imageWidth: 1000,
    imageHeight: 1000,
    containerWidth: 100,
    containerHeight: 140,
  });

  assert.ok(layout.automaticZoom > 4);
  const renderedFaceCenterX = layout.left + (faceBox.Left + faceBox.Width / 2) * 1000 * layout.scale;
  const renderedFaceCenterY = layout.top + (faceBox.Top + faceBox.Height / 2) * 1000 * layout.scale;
  closeTo(renderedFaceCenterX, 50);
  closeTo(renderedFaceCenterY, 70);
});

test('manual thumbnail crop values are safely bounded', () => {
  assert.deepEqual(sanitizeThumbnailCrop({ x: 200, y: -200, zoom: 9 }), {
    x: 45,
    y: -45,
    zoom: 2.25,
  });
});

test('manual zoom multiplies automatic face focus', () => {
  const input = {
    faceBox: { Left: 0.4, Top: 0.3, Width: 0.2, Height: 0.2 },
    imageWidth: 1000,
    imageHeight: 1000,
    containerWidth: 100,
    containerHeight: 100,
  };
  const automatic = calculateFaceCropLayout(input);
  const edited = calculateFaceCropLayout({ ...input, manualCrop: { zoom: 2 } });
  closeTo(edited.scale, automatic.scale * 2);
});

test('drag offsets cannot reveal empty space around the card', () => {
  const layout = calculateFaceCropLayout({
    faceBox: { Left: 0.5, Top: 0.5, Width: 0.1, Height: 0.1 },
    manualCrop: { x: 45, y: -45, zoom: 1 },
    imageWidth: 1200,
    imageHeight: 800,
    containerWidth: 100,
    containerHeight: 140,
  });
  assert.ok(layout.left <= 0);
  assert.ok(layout.top <= 0);
  assert.ok(layout.left + layout.width >= 100);
  assert.ok(layout.top + layout.height >= 140);
});
