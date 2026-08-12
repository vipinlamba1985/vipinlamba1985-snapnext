// Generating and caching media derivatives.
//
// Photo thumbnails use a read-through cache: the original is read exactly once
// on a miss, resized, and the derivative is stored under the hot thumbnail
// prefix. Video posters deliberately work differently: the server never decodes
// the original video. The user's device extracts a small JPEG frame from the
// already-selected local video and this module only validates/resizes/stores
// that derivative.
//
// Originals are only ever read, never written. Storing derivatives elsewhere
// leaves imported files byte-identical.

// Relative imports keep this module loadable by the Node test runner, which
// does not resolve the `@/` alias.
import { storage } from './storage.js';
import {
  DEFAULT_THUMBNAIL_SIZE,
  THUMBNAIL_QUALITY,
  VIDEO_POSTER_MAX_BYTES,
  VIDEO_POSTER_SIZE,
  canGenerateThumbnail,
  canStoreVideoPoster,
  normalizeThumbnailSize,
  thumbnailKey,
  videoPosterKey,
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
    // but must not fail a photo request, because the original can still resize.
    if (error?.name !== 'NoSuchKey' && error?.$metadata?.httpStatusCode !== 404) {
      console.error('[thumbnail] cache read failed', key, error?.name);
    }
    return null;
  }
}

async function writeCached(key, body, { required = false } = {}) {
  if (!s3Configured()) {
    if (required) throw new Error('Derivative storage is not configured.');
    return false;
  }
  try {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await s3Client();
    await client.send(new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: 'image/jpeg',
      // Derivatives are rebuildable, so the cheapest hot durability tier is right.
      StorageClass: 'STANDARD',
      CacheControl: 'private, max-age=31536000, immutable',
    }));
    return true;
  } catch (error) {
    if (required) throw error;
    // Failing to cache a generated photo thumbnail is not failing to serve it.
    console.error('[thumbnail] cache write failed', key, error?.name);
    return false;
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
 * Returns a photo thumbnail, generating and caching it on first request.
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

/** Read a stored video poster. This path never reads or decodes the original video. */
export async function getVideoPoster({ doc, userId }) {
  if (!canStoreVideoPoster(doc)) return null;
  const key = videoPosterKey({ userId, mediaId: doc.id });
  const cached = await readCached(key);
  if (!cached?.length) return null;
  return { buffer: cached, cached: true, key };
}

/**
 * Validate and store a JPEG frame produced locally by the user's browser/native
 * webview. Sharp decodes the small image derivative only; it never sees video.
 */
export async function storeVideoPoster({ doc, userId, buffer }) {
  if (!canStoreVideoPoster(doc)) throw new Error('Poster source must be a stored video.');
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Video poster is empty.');
  if (buffer.length > VIDEO_POSTER_MAX_BYTES) throw new Error('Video poster exceeds the allowed size.');

  const rendered = await renderThumbnail(buffer, VIDEO_POSTER_SIZE);
  if (rendered.length > VIDEO_POSTER_MAX_BYTES) throw new Error('Video poster remains too large after validation.');

  const key = videoPosterKey({ userId, mediaId: doc.id });
  await writeCached(key, rendered, { required: true });
  return { buffer: rendered, cached: false, key };
}
