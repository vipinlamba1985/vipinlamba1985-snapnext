import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_DISTINCT_PHOTOS_FOR_PEOPLE_THUMBNAIL,
  classifyPersonMedia,
  personThumbnailEligibility,
} from '../lib/people-gallery-rules.js';

test('automatic People thumbnails require three different photos', () => {
  assert.equal(MIN_DISTINCT_PHOTOS_FOR_PEOPLE_THUMBNAIL, 3);
  assert.equal(personThumbnailEligibility({ name: 'one', photos: 1 }).eligible, false);
  assert.equal(personThumbnailEligibility({ name: 'two', photos: 2 }).eligible, false);
  assert.equal(personThumbnailEligibility({ name: 'three', photos: 3 }).eligible, true);
});

test('self, active and explicitly restored people remain recoverable below the threshold', () => {
  assert.equal(personThumbnailEligibility({ name: 'self', photos: 1, isSelf: true }).reason, 'self');
  assert.equal(personThumbnailEligibility({ name: 'active', photos: 1 }, ['active']).reason, 'active');
  assert.equal(personThumbnailEligibility({ name: 'restored', photos: 1, restoredAt: new Date() }).reason, 'restored');
});

test('solo and family-sized photos can appear in Best of a person', () => {
  const solo = classifyPersonMedia({ peopleIntelligence: { faceIds: ['f1'], clusterIds: ['selected'] } }, { selectedClusterId: 'selected' });
  const family = classifyPersonMedia({ peopleIntelligence: { faceIds: ['f1', 'f2', 'f3', 'f4'], clusterIds: ['selected', 'parent', 'child-1', 'child-2'] } }, { selectedClusterId: 'selected' });
  assert.equal(solo.groupPhoto, false);
  assert.equal(solo.bestEligible, true);
  assert.equal(family.familySizedGroup, true);
  assert.equal(family.bestEligible, true);
});

test('large crowd photos stay out of Best unless another active person is present', () => {
  const item = {
    peopleIntelligence: {
      faceIds: ['f1', 'f2', 'f3', 'f4', 'f5'],
      clusterIds: ['selected', 'friend', 'guest-1', 'guest-2', 'guest-3'],
    },
  };
  const crowd = classifyPersonMedia(item, { selectedClusterId: 'selected', activeClusterIds: ['selected'] });
  const activeCrowd = classifyPersonMedia(item, { selectedClusterId: 'selected', activeClusterIds: ['selected', 'friend'] });
  assert.equal(crowd.largeGroupPhoto, true);
  assert.equal(crowd.bestEligible, false);
  assert.equal(activeCrowd.hasOtherActivePerson, true);
  assert.equal(activeCrowd.bestEligible, true);
});
