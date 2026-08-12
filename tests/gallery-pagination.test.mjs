import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildGalleryQuery,
  clampGalleryPageSize,
  decodeGalleryCursor,
  encodeGalleryCursor,
  listGalleryPage,
} from '../lib/gallery-pagination.js';

const UPLOADED = new Date('2026-08-12T10:00:00.000Z');
const CREATED = new Date('2020-01-01T10:00:00.000Z');

test('Gallery page size is bounded for mobile memory safety', () => {
  assert.equal(clampGalleryPageSize(undefined), 60);
  assert.equal(clampGalleryPageSize(1), 20);
  assert.equal(clampGalleryPageSize(48), 48);
  assert.equal(clampGalleryPageSize(5000), 100);
});

test('Gallery cursor round-trips upload order without exposing database ids', () => {
  const encoded = encodeGalleryCursor({
    id: 'media-public-id',
    uploadedAt: UPLOADED,
    createdAt: CREATED,
    _id: 'mongo-private-id',
  });
  const decoded = decodeGalleryCursor(encoded);

  assert.ok(encoded);
  assert.equal(decoded.id, 'media-public-id');
  assert.equal(decoded.uploadedAt.toISOString(), UPLOADED.toISOString());
  assert.equal(decoded.createdAt.toISOString(), CREATED.toISOString());
  assert.equal(encoded.includes('mongo-private-id'), false);
});

test('invalid Gallery cursors fail closed', () => {
  assert.equal(decodeGalleryCursor('not-a-valid-cursor'), null);
  assert.equal(encodeGalleryCursor({ id: 'missing-dates' }), null);
});

test('Places and Events are server filters instead of client-only scans', () => {
  const places = buildGalleryQuery({ userId: 'user-1', filter: 'places' });
  assert.deepEqual(places, {
    userId: 'user-1',
    trashed: { $ne: true },
    $and: [{ 'aiAnalysis.locations.0': { $exists: true } }],
  });

  const events = buildGalleryQuery({ userId: 'user-1', filter: 'events' });
  assert.equal(events.userId, 'user-1');
  assert.equal(events.$and.length, 1);
  assert.equal(events.$and[0].$or.length, 3);
});

test('search and cursor constraints compose without weakening either condition', () => {
  const cursor = decodeGalleryCursor(encodeGalleryCursor({
    id: 'm-050',
    uploadedAt: UPLOADED,
    createdAt: CREATED,
  }));
  const query = buildGalleryQuery({ userId: 'user-1', filter: 'photo', query: 'beach', cursor });

  assert.equal(query.kind, 'photo');
  assert.equal(query.$and.length, 2);
  assert.ok(query.$and[0].$or.every(entry => Object.values(entry)[0].$regex.includes('beach')));
  assert.ok(Array.isArray(query.$and[1].$or));
});

test('Gallery reads one extra row, returns a stable page, and creates a next cursor', async () => {
  const docs = Array.from({ length: 61 }, (_, index) => ({
    _id: `mongo-${index}`,
    id: `media-${String(100 - index).padStart(3, '0')}`,
    userId: 'user-1',
    uploadedAt: new Date(UPLOADED.getTime() - index * 1000),
    createdAt: CREATED,
    kind: 'photo',
  }));

  let queryValue = null;
  let sortValue = null;
  let limitValue = null;
  const db = {
    collection(name) {
      assert.equal(name, 'media');
      return {
        find(query) {
          queryValue = query;
          return {
            sort(value) {
              sortValue = value;
              return this;
            },
            limit(value) {
              limitValue = value;
              return this;
            },
            async toArray() {
              return docs;
            },
          };
        },
      };
    },
  };

  const page = await listGalleryPage({ db, userId: 'user-1', filter: 'all', limit: 60 });

  assert.deepEqual(queryValue, { userId: 'user-1', trashed: { $ne: true } });
  assert.deepEqual(sortValue, { uploadedAt: -1, createdAt: -1, id: -1 });
  assert.equal(limitValue, 61);
  assert.equal(page.items.length, 60);
  assert.equal(page.hasMore, true);
  assert.ok(page.nextCursor);
  assert.equal(page.items[0]._id, undefined);
});

test('Gallery UI uses paged media and optimized thumbnails without preloading video files', async () => {
  const [page, route, helper, db] = await Promise.all([
    readFile(new URL('../app/(app)/gallery/page.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/media/route.js', import.meta.url), 'utf8'),
    readFile(new URL('../lib/gallery-media-client.js', import.meta.url), 'utf8'),
    readFile(new URL('../lib/db.js', import.meta.url), 'utf8'),
  ]);

  assert.match(page, /view: 'gallery'/);
  assert.match(page, /limit: '60'/);
  assert.match(page, /data-testid="library-load-more"/);
  assert.match(page, /galleryThumbnailSrc\(item\.id, 480\)/);
  assert.match(page, /if \(preview\) return <div/);
  assert.doesNotMatch(page, /if \(preview\)[\s\S]{0,180}<video src=/);
  assert.match(route, /listGalleryPage/);
  assert.match(helper, /\/thumbnail\?w=/);
  assert.match(db, /uploadedAt: -1, createdAt: -1, id: -1/);
});
