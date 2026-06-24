/**
 * SnapNext AI storage abstraction.
 *
 * - Selects an active provider via STORAGE_PROVIDER ('local' | 's3').
 * - Per-item dispatch uses the `provider` field stored on the media doc, so
 *   legacy local files keep working after switching the default to S3.
 * - S3 provider is configured lazily; missing env vars produce a clear
 *   server error rather than crashing the app at boot.
 *
 * Object key layout (S3): users/{userId}/media/{mediaId}/{sanitizedName}
 *
 * Provider interface:
 *   save({ userId, fileId, buffer, ext, name, mime }) -> { storageKey, size, provider }
 *   read({ storageKey })                              -> Buffer
 *   delete({ storageKey })                            -> void
 *   getReadUrl({ storageKey, expiresSec, filename })  -> string | null
 *   health()                                          -> { name, ready, ... }
 *   // multipart (S3 only, stubs for now):
 *   createMultipartUpload, uploadPart, completeMultipartUpload, abortMultipartUpload
 */

import fs from 'fs/promises';
import path from 'path';

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads';
const ACTIVE = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();
const SIGNED_TTL = parseInt(process.env.S3_SIGNED_URL_TTL || '3600', 10);
const MAX_UPLOAD_BYTES = (parseInt(process.env.MAX_UPLOAD_SIZE_MB || '500', 10)) * 1024 * 1024;

export const STORAGE_CONFIG = {
  active: ACTIVE,
  signedTtl: SIGNED_TTL,
  maxUploadBytes: MAX_UPLOAD_BYTES,
};

function sanitizeFileName(name = 'file') {
  return String(name)
    .replace(/[^\w.\-]+/g, '_')   // safe chars only
    .replace(/_+/g, '_')
    .slice(0, 120) || 'file';
}
function extOf(name = '', mime = '') {
  const fromName = (name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (fromName && fromName.length <= 8) return fromName;
  if (mime.startsWith('image/')) return mime.split('/')[1];
  if (mime.startsWith('video/')) return mime.split('/')[1];
  return 'bin';
}

// ---------- LOCAL PROVIDER ----------
const local = {
  name: 'local',
  ready: true,

  async save({ userId, fileId, buffer, ext, name }) {
    const userDir = path.join(UPLOAD_DIR, userId);
    await fs.mkdir(userDir, { recursive: true });
    const safeExt = (ext || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8);
    const fullPath = path.join(userDir, `${fileId}.${safeExt}`);
    await fs.writeFile(fullPath, buffer);
    return { storageKey: `${userId}/${fileId}.${safeExt}`, size: buffer.length, provider: 'local' };
  },
  async read({ storageKey }) {
    return fs.readFile(path.join(UPLOAD_DIR, storageKey));
  },
  async delete({ storageKey }) {
    try { await fs.unlink(path.join(UPLOAD_DIR, storageKey)); } catch {}
  },
  async getReadUrl() { return null; },   // null => stream through API
  health() {
    return { name: 'local', ready: true, uploadDir: UPLOAD_DIR };
  },
};

// ---------- S3 PROVIDER (lazy) ----------
let _s3Client = null;
let _presigner = null;
let _s3InitError = null;

function s3EnvMissing() {
  const missing = [];
  if (!process.env.AWS_ACCESS_KEY_ID) missing.push('AWS_ACCESS_KEY_ID');
  if (!process.env.AWS_SECRET_ACCESS_KEY) missing.push('AWS_SECRET_ACCESS_KEY');
  if (!process.env.AWS_REGION) missing.push('AWS_REGION');
  if (!process.env.AWS_S3_BUCKET) missing.push('AWS_S3_BUCKET');
  return missing;
}

async function getS3() {
  if (_s3Client) return { client: _s3Client, presign: _presigner };
  if (_s3InitError) throw _s3InitError;
  const missing = s3EnvMissing();
  if (missing.length) {
    _s3InitError = new Error(`AWS S3 not configured. Missing: ${missing.join(', ')}`);
    throw _s3InitError;
  }
  const { S3Client } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  _s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  _presigner = getSignedUrl;
  return { client: _s3Client, presign: _presigner };
}

const s3 = {
  name: 's3',
  get ready() { return s3EnvMissing().length === 0; },

  async save({ userId, fileId, buffer, ext, name, mime }) {
    if (buffer.length > MAX_UPLOAD_BYTES) {
      throw new Error(`File exceeds max size (${process.env.MAX_UPLOAD_SIZE_MB || 500} MB). Use multipart upload.`);
    }
    const { client } = await getS3();
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const safeName = sanitizeFileName(name || `${fileId}.${ext || 'bin'}`);
    const key = `users/${userId}/media/${fileId}/${safeName}`;
    await client.send(new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mime || 'application/octet-stream',
      // ServerSideEncryption: 'AES256',  // enable on bucket policy level
    }));
    return { storageKey: key, size: buffer.length, provider: 's3' };
  },

  async read({ storageKey }) {
    const { client } = await getS3();
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const res = await client.send(new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: storageKey }));
    // Buffer body
    const stream = res.Body;
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
  },

  async delete({ storageKey }) {
    try {
      const { client } = await getS3();
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      await client.send(new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: storageKey }));
    } catch (e) {
      console.error('[storage:s3] delete failed', e?.message);
    }
  },

  async getReadUrl({ storageKey, expiresSec = SIGNED_TTL, filename = null, contentType = null }) {
    const { client, presign } = await getS3();
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const params = { Bucket: process.env.AWS_S3_BUCKET, Key: storageKey };
    if (filename) params.ResponseContentDisposition = `attachment; filename="${sanitizeFileName(filename)}"`;
    if (contentType) params.ResponseContentType = contentType;
    return presign(client, new GetObjectCommand(params), { expiresIn: expiresSec });
  },

  // Presigned PUT for direct browser uploads (future use).
  async getUploadUrl({ userId, fileId, name, mime, expiresSec = 600 }) {
    const { client, presign } = await getS3();
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const safeName = sanitizeFileName(name || fileId);
    const key = `users/${userId}/media/${fileId}/${safeName}`;
    const url = await presign(client, new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      ContentType: mime || 'application/octet-stream',
    }), { expiresIn: expiresSec });
    return { url, storageKey: key, provider: 's3' };
  },

  async health() {
    const missing = s3EnvMissing();
    const ok = missing.length === 0;
    let bucketReachable = false;
    let lastError = null;
    let signedSample = null;
    if (ok) {
      try {
        const { client } = await getS3();
        const { HeadBucketCommand } = await import('@aws-sdk/client-s3');
        await client.send(new HeadBucketCommand({ Bucket: process.env.AWS_S3_BUCKET }));
        bucketReachable = true;
        signedSample = await s3.getReadUrl({ storageKey: 'health/probe.txt', expiresSec: 60 }).catch(() => null);
      } catch (e) { lastError = e?.message || String(e); }
    } else {
      lastError = `Missing env: ${missing.join(', ')}`;
    }
    const bucket = process.env.AWS_S3_BUCKET || '';
    const masked = bucket ? bucket.slice(0, 3) + '***' + bucket.slice(-3) : null;
    return {
      name: 's3', ready: ok, bucket: masked, region: process.env.AWS_REGION || null,
      bucketReachable, lastError, signedSample: signedSample ? signedSample.split('?')[0] + '?(redacted)' : null,
    };
  },

  // ---------- Multipart upload (stubs / not exposed in UI yet) ----------
  // TODO: wire these endpoints when we add a resumable uploader for >500MB videos.
  async createMultipartUpload({ userId, fileId, name, mime }) {
    const { client } = await getS3();
    const { CreateMultipartUploadCommand } = await import('@aws-sdk/client-s3');
    const safeName = sanitizeFileName(name || fileId);
    const key = `users/${userId}/media/${fileId}/${safeName}`;
    const res = await client.send(new CreateMultipartUploadCommand({
      Bucket: process.env.AWS_S3_BUCKET, Key: key, ContentType: mime || 'application/octet-stream',
    }));
    return { storageKey: key, uploadId: res.UploadId };
  },
  async signUploadPartUrl({ storageKey, uploadId, partNumber, expiresSec = 600 }) {
    const { client, presign } = await getS3();
    const { UploadPartCommand } = await import('@aws-sdk/client-s3');
    return presign(client, new UploadPartCommand({
      Bucket: process.env.AWS_S3_BUCKET, Key: storageKey, UploadId: uploadId, PartNumber: partNumber,
    }), { expiresIn: expiresSec });
  },
  async completeMultipartUpload({ storageKey, uploadId, parts }) {
    const { client } = await getS3();
    const { CompleteMultipartUploadCommand } = await import('@aws-sdk/client-s3');
    return client.send(new CompleteMultipartUploadCommand({
      Bucket: process.env.AWS_S3_BUCKET, Key: storageKey, UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    }));
  },
  async abortMultipartUpload({ storageKey, uploadId }) {
    const { client } = await getS3();
    const { AbortMultipartUploadCommand } = await import('@aws-sdk/client-s3');
    return client.send(new AbortMultipartUploadCommand({
      Bucket: process.env.AWS_S3_BUCKET, Key: storageKey, UploadId: uploadId,
    }));
  },
};

// ---------- DISPATCHER ----------
const PROVIDERS = { local, s3 };

function pick(p) {
  if (p && PROVIDERS[p]) return PROVIDERS[p];
  return PROVIDERS[ACTIVE] || local;
}

/** Used for new uploads (writes to the active provider). */
export const storage = {
  config: STORAGE_CONFIG,
  active() { return ACTIVE; },
  validateBeforeSave({ size }) {
    if (size > MAX_UPLOAD_BYTES) {
      throw new Error(`File too large. Max ${process.env.MAX_UPLOAD_SIZE_MB || 500} MB. Larger files require multipart upload.`);
    }
  },
  async save(args) { return pick(ACTIVE).save({ ...args, ext: args.ext || extOf(args.name, args.mime) }); },
  async read({ provider, storageKey }) { return pick(provider).read({ storageKey }); },
  async delete({ provider, storageKey }) { return pick(provider).delete({ storageKey }); },
  async getReadUrl({ provider, storageKey, ...rest }) {
    const p = pick(provider);
    if (p.getReadUrl) return p.getReadUrl({ storageKey, ...rest });
    return null;
  },
  // Presigned direct-upload (future UI work). Only S3 supports this.
  async getUploadUrl(args) {
    if (ACTIVE !== 's3') throw new Error('Direct upload URLs require STORAGE_PROVIDER=s3');
    return s3.getUploadUrl(args);
  },
  async health() {
    const localH = local.health();
    let s3H = null;
    try { s3H = await s3.health(); } catch (e) { s3H = { name: 's3', ready: false, lastError: e?.message }; }
    return { active: ACTIVE, providers: { local: localH, s3: s3H } };
  },
};

// Backwards-compat shim for code that still imports `storageProvider`.
export const storageProvider = {
  name: ACTIVE,
  save(args) { return storage.save(args); },
  read(storageKey, provider = null) { return storage.read({ provider, storageKey }); },
  delete(storageKey, provider = null) { return storage.delete({ provider, storageKey }); },
};
