// Generating and caching thumbnails.
//
// Read-through cache: ask for a derivative, and it is generated from the
// original exactly once and stored under its own prefix. Every later request
// reads the small cached object, so the original is never touched again by
// ordinary browsing.
//
// The original is only ever read, never written. Storing a derivative elsewhere
// leaves the imported file byte-identical, which is a rule the product depends
// on for anything synced from an external provider.

// Relative imports keep this module loadable by the Node test runner, which
// does not resolve the `@/` alias.
import { storage } from './storage.js';
import {
  DEFAULT_THUMBNAIL_SIZE,
  THUMBNAIL_QUALITY,
  canGenerateThumbnail,
  normalizeThumbnailSize,
  thumbnailKey,
} from './thumbnails.js';

function s3Configured() {
  return Boolean(process.env.AWS_S3_BUCKET && process.env.AWS_REGION);
}

async function s3Client() {
  const { S3Client } = await import('@aws-sdk/client-s3');
  return new S3Client({
    region: process.env.AWS_REGION,
    credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }
      : undefined,
  });
}

async function readCached(key) {
  if (!s3Configured()) return null;
  try {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await s3Client();
    const object = await client.send(new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: key }));
    if (!object.Body) return null;
    return Buffer.from(await object.Body.transformToByteArray());
  } catch (error) {
    // A miss is the normal path the first time; anything else is worth seeing
    // but must not fail the request, because the original can still be resized.
    if (error?.name !== 'NoSuchKey' && error?.$metadata?.httpStatusCode !== 404) {
      console.error('[thumbnail] cache read failed', key, error?.name);
    }
    return null;
  }
}

async function writeCached(key, body) {
  if (!s3Configured()) return;
  try {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await s3Client();
    await client.send(new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: 'image/jpeg',
      // Derivatives are rebuildable, so the cheapest durability tier is right.
      StorageClass: 'STANDARD',
      CacheControl: 'private, max-age=31536000, immutable',
    }));
  } catch (error) {
    // Failing to cache is not failing to serve.
    console.error('[thumbnail] cache write failed', key, error?.name);
  }
}

/** Resizes an image buffer. `rotate()` first so EXIF orientation is respected. */
export async function renderThumbnail(buffer, size = DEFAULT_THUMBNAIL_SIZE) {
  const sharp = (await import('sharp')).default;
  return sharp(buffer)
    .rotate()
    .resize(size, size, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: THUMBNAIL_QUALITY, mozjpeg: true })
    .toBuffer();
}

/**
 * Returns a thumbnail, generating and caching it on first request.
 *
 * `source` is how the original is read; it is only called on a cache miss, so a
 * warm thumbnail never touches the original at all — which is what makes it
 * safe to move originals to cold storage.
 */
export async function getOrCreateThumbnail({ doc, userId, size = DEFAULT_THUMBNAIL_SIZE, source }) {
  if (!canGenerateThumbnail(doc)) return null;

  const width = normalizeThumbnailSize(size);
  const key = thumbnailKey({ userId, mediaId: doc.id, size: width });

  const cached = await readCached(key);
  if (cached?.length) return { buffer: cached, cached: true, key };

  const original = await source();
  if (!original?.length) return null;

  const buffer = await renderThumbnail(original, width);
  await writeCached(key, buffer);
  return { buffer, cached: false, key };
}
