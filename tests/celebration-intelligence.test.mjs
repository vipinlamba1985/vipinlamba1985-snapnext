import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCelebrationSetupPrompts,
  buildContextualCelebrations,
  buildMemoryCelebrationSuggestions,
  countryCodeFor,
  extractCountrySignals,
  resolveProfileCelebrationDate,
} from '../lib/celebration-intelligence.js';

test('country names and ISO codes normalize without inferring identity', () => {
  assert.equal(countryCodeFor('Canada'), 'CA');
  assert.equal(countryCodeFor('India'), 'IN');
  assert.equal(countryCodeFor('ca'), 'CA');
  assert.equal(countryCodeFor('Toronto'), null);
});

test('setup prompts ask for personal basics and important family dates without making anniversary mandatory', () => {
  const prompts = buildCelebrationSetupPrompts({ user: { name: 'Vipin' }, profiles: [], favoriteCount: 2 });
  assert.equal(prompts[0].id, 'setup:self-birthday');
  assert.ok(prompts.some((prompt) => prompt.id === 'setup:family-birthdays'));
  assert.ok(prompts.some((prompt) => prompt.id === 'setup:countries'));

  const withSelf = buildCelebrationSetupPrompts({
    profiles: [{ id: 'self', name: 'Vipin', relationship: 'You', birthday: '1985-07-25', currentCountry: 'Canada' }],
  });
  assert.ok(withSelf.some((prompt) => prompt.id === 'setup:self-anniversary'));
  assert.match(withSelf.find((prompt) => prompt.id === 'setup:self-anniversary').title, /optional/i);
});

test('birthday photos create a confirmation-first suggestion for a named person', () => {
  const suggestions = buildMemoryCelebrationSuggestions({
    media: [{
      id: 'm1',
      name: 'Birthday party',
      capturedAt: '2025-07-24T16:00:00Z',
      aiAnalysis: { tags: ['birthday', 'cake'] },
      peopleIntelligence: { clusterIds: ['p1'] },
    }],
    peopleByCluster: { p1: 'Priyansh' },
  });
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].personName, 'Priyansh');
  assert.equal(suggestions[0].type, 'birthday');
  assert.match(suggestions[0].question, /Priyansh's birthday/i);
  assert.match(suggestions[0].question, /July 24/i);
  assert.equal(suggestions[0].confidence, 'medium');
});

test('self People clusters retain identity for profile confirmation', () => {
  const suggestions = buildMemoryCelebrationSuggestions({
    media: [{
      id: 'self-memory',
      name: 'Birthday cake',
      capturedAt: '2025-07-24T16:00:00Z',
      peopleIntelligence: { clusterIds: ['self-cluster'] },
    }],
    peopleByCluster: { 'self-cluster': { name: 'Vipin', isSelf: true } },
    profiles: [{ id: 'self', name: 'Vipin', relationship: 'You' }],
  });
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].personName, 'Vipin');
  assert.equal(suggestions[0].personIsSelf, true);
  assert.match(suggestions[0].question, /your birthday/i);
});

test('profile confirmation preserves a known year and refuses to invent a missing year', () => {
  const preserved = resolveProfileCelebrationDate({
    monthDay: '07-24',
    existingDate: '2015-06-10T00:00:00.000Z',
  });
  assert.equal(preserved.toISOString().slice(0, 10), '2015-07-24');
  assert.equal(resolveProfileCelebrationDate({ monthDay: '07-24' }), null);

  const explicit = resolveProfileCelebrationDate({
    monthDay: '07-24',
    confirmedDate: '2012-07-24T00:00:00.000Z',
  });
  assert.equal(explicit.toISOString().slice(0, 10), '2012-07-24');
});

test('confirmed profile dates suppress duplicate memory suggestions', () => {
  const suggestions = buildMemoryCelebrationSuggestions({
    media: [{ id: 'm1', capturedAt: '2025-07-24T16:00:00Z', aiAnalysis: { description: 'Priyansh birthday party' }, peopleIntelligence: { clusterIds: ['p1'] } }],
    peopleByCluster: { p1: 'Priyansh' },
    profiles: [{ id: 'p1', name: 'Priyansh', relationship: 'Son', birthday: '2015-07-24' }],
  });
  assert.equal(suggestions.length, 0);
});

test('country signals come from explicit profile or travel metadata only', () => {
  const signals = extractCountrySignals({
    profiles: [{ name: 'Vipin', relationship: 'You', currentCountry: 'Canada', originCountries: ['India'] }],
    media: [{ aiAnalysis: { locations: ['Paris, France'] } }],
  });
  assert.deepEqual(signals.map((item) => item.code), ['CA', 'IN', 'FR']);
  assert.equal(signals.find((item) => item.code === 'FR').source, 'visited');
});

test('contextual holidays are limited to relevant upcoming country and travel days', async () => {
  const mockFetch = async (url) => {
    const isCanada = url.includes('/CA/');
    return {
      ok: true,
      async json() {
        return isCanada
          ? [{ date: '2026-07-01', name: 'Canada Day', nationalHoliday: true, holidayTypes: ['Public'] }, { date: '2026-07-27', name: 'Future Canada Day Test', nationalHoliday: false, holidayTypes: ['Observance'] }]
          : [{ date: '2026-08-15', name: 'Independence Day', nationalHoliday: true, holidayTypes: ['Public'] }];
      },
    };
  };
  const items = await buildContextualCelebrations({
    profiles: [{ name: 'Vipin', relationship: 'You', currentCountry: 'Canada', originCountries: ['India'] }],
    now: new Date('2026-07-25T12:00:00Z'),
    fetchImpl: mockFetch,
  });
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'Future Canada Day Test');
  assert.equal(items[0].daysUntil, 2);
  assert.ok(items.some((item) => item.title === 'Independence Day' && item.countryCode === 'IN'));
});
