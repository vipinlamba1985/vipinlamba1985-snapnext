import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDirectorFeed,
  buildEventCard,
  contentSuggestions,
  nextAnnualOccurrence,
  profileCompleteness,
} from '../lib/life-event-director.js';

test('annual occurrence rolls into the next year after the date passes', () => {
  const now = new Date('2026-07-16T12:00:00Z');
  const next = nextAnnualOccurrence('2020-03-21', now);
  assert.equal(next.getFullYear(), 2027);
  assert.equal(next.getMonth(), 2);
  assert.equal(next.getDate(), 21);
});

test('profile readiness requires relationship and birthday but supports multicultural celebrations', () => {
  const incomplete = profileCompleteness({ name: 'Priyansh', relationship: 'Son' });
  assert.equal(incomplete.eventReady, false);
  assert.ok(incomplete.missingRequired.includes('birthday'));

  const complete = profileCompleteness({
    name: 'Priyansh',
    relationship: 'Son',
    birthday: '2020-03-21',
    photoId: 'photo-1',
    anniversary: '2020-01-01',
    originCountries: ['India'],
    currentCountry: 'Canada',
    celebrations: ['Diwali', 'Canada Day', 'Christmas'],
  });
  assert.equal(complete.eventReady, true);
  assert.equal(complete.percent, 100);
});

test('birthday suggestions include social-ready formats without auto posting', () => {
  assert.deepEqual(contentSuggestions({ type: 'birthday' }), ['reel', 'collage', 'whatsapp-status', 'image-post', 'greeting-card']);
});

test('events become urgent within three days', () => {
  const card = buildEventCard({ id: 'event-1', type: 'festival', title: 'Festival', date: '2026-07-18', annual: false }, new Date('2026-07-16T12:00:00Z'));
  assert.equal(card.daysUntil, 2);
  assert.equal(card.urgent, true);
  assert.equal(card.stage, 'final-review');
});

test('expired one-time events are not urgent and are removed from the upcoming feed', () => {
  const now = new Date('2026-07-16T12:00:00Z');
  const expired = buildEventCard({ id: 'past-trip', type: 'trip', title: 'Past trip', date: '2026-07-10', annual: false }, now);
  assert.equal(expired.daysUntil, -6);
  assert.equal(expired.urgent, false);

  const feed = buildDirectorFeed({
    events: [
      { id: 'past-trip', type: 'trip', title: 'Past trip', date: '2026-07-10', annual: false },
      { id: 'future-trip', type: 'trip', title: 'Future trip', date: '2026-07-20', annual: false },
    ],
    now,
  });
  assert.deepEqual(feed.upcoming.map(item => item.id), ['future-trip']);
});

test('feed includes profile birthdays and user-selected cultural events together', () => {
  const feed = buildDirectorFeed({
    profiles: [{ id: 'p1', name: 'Mom', relationship: 'Mother', birthday: '1965-07-20', celebrations: ['Diwali'] }],
    events: [{ id: 'e1', type: 'national-day', title: 'Canada Day', date: '2026-07-01', annual: true, countries: ['Canada'] }],
    now: new Date('2026-07-16T12:00:00Z'),
  });
  assert.equal(feed.upcoming.length, 2);
  assert.equal(feed.upcoming[0].title, "Mom's birthday");
  assert.ok(feed.upcoming.some(item => item.title === 'Canada Day'));
});
