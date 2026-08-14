import test from 'node:test';
import assert from 'node:assert/strict';
import { FREE_STORY_AUDIO_TRACKS, soundtrackForStory } from '../lib/ready-story-audio.js';

test('Ready Story default audio is explicit CC0 media', () => {
  const track = FREE_STORY_AUDIO_TRACKS[0];
  assert.ok(track);
  assert.equal(track.provider, 'Wikimedia Commons');
  assert.equal(track.license, 'CC0-1.0');
  assert.equal(track.commercialUseAllowed, true);
  assert.equal(track.attributionRequired, false);
});

test('Ready Story soundtrack selection has a deterministic fallback', () => {
  assert.equal(soundtrackForStory({ type: 'wedding' })?.id, FREE_STORY_AUDIO_TRACKS[0].id);
  assert.equal(soundtrackForStory({ type: 'unknown' })?.id, FREE_STORY_AUDIO_TRACKS[0].id);
});
