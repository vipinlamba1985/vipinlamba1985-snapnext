/**
 * SnapNext storage abstraction with post-write verification.
 * New uploads are not reported as successful until the provider confirms that
 * the stored object exists and its byte length matches the uploaded payload.
 */
import fs from 'fs/promises';
import path from 'path';

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads';
const ACTIVE = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();
const SIGNED_TTL = Number.parseInt(process.env.S3_SIGNED_URL_TTL || '3600', 10);
const MAX_UPLOAD_BYTES = Number.parseInt(process.env.MAX_UPLOAD_SIZE_MB || '500', 10) * 1024 * 1024;

export const STORAGE_CONFIG = {
  active: ACTIVE,
  signedTtl: SIGNED_TTL,
  maxUploadBytes: MAX_UPLOAD_BYTES,
};

function sanitizeFileName(name = 'file') {
  return String(name).replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').slice(0, 120) || 'file';
}

function extOf(name = '', mime = '') {
  const fromName = (name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (fromName && fromName.length <= 8) return fromName;
  if (mime.startsWith('image/') || mime.startsWith('video/')) return mime.split('/')[1];
  return 'bin';
}

function assertExpectedSize(actual, expected, provider, storageKey) {
  if (!Number.isFinite(actual)) {
    throw new Error(`${provider} verification did not return a valid size for ${storageKey}`);
  }
  if (actual !== expected) {
    throw new Error(`${provider} verification size mismatch for ${storageKey}: expected ${expected}, received ${actual}`);
  }
}

const local = {
  name: 'local',
  ready: true,

  async save({ userId, fileId, buffer, ext }) {
    const userDir = path.join(UPLOAD_DIR, userId);
    await fs.mkdir(userDir, { recursive: true });
    const safeExt = (ext || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8);
    const storageKey = `${userId}/${fileId}.${safeExt}`;
    const fullPath = path.join(UPLOAD_DIR, storageKey);
    await fs.writeFile(fullPath, buffer);
    const verified = await local.verify({ storageKey, expectedSize: buffer.length });
    return { storageKey, size: verified.size, provider: 'local', verified: true };
  },

  async verify({ storageKey, expectedSize }) {
    const stat = await fs.stat(path.join(UPLOAD_DIR, storageKey));
    if (!stat.isFile()) throw new Error(`Local storage object is not a file: ${storageKey}`);
    if (expectedSize !== undefined) assertExpectedSize(stat.size, expectedSize, 'local', storageKey);
    return { exists: true, size: stat.size, provider: 'local', storageKey, lastModified: stat.mtime };
  },

  async read({ storageKey }) {
    return fs.readFile(path.join(UPLOAD_DIR, storageKey));
  },

  async delete({ storageKey }) {
    try {
      await fs.unlink(path.join(UPLOAD_DIR, storageKey));
      return true;
    } catch (error) {
      if (error?.code === 'ENOENT') return false;
      throw error;
    }
  },

  async getReadUrl() { return null; },
  health() { return { name: 'local', ready: true, uploadDir: UPLOAD_DIR }; },
};

let s3Client = null;
let presigner = null;
let s3InitError = null;

function s3EnvMissing() {
  const missing = [];
  if (!process.env.AWS_ACCESS_KEY_ID) missing.push('AWS_ACCESS_KEY_ID');
  if (!process.env.AWS_SECRET_ACCESS_KEY) missing.push('AWS_SECRET_ACCESS_KEY');
  if (!process.env.AWS_REGION) missing.push('AWS_REGION');
  if (!process.env.AWS_S3_BUCKET) missing.push('AWS_S3_BUCKET');
  return missing;
}

async function getS3() {
  if (s3Client) return { client: s3Client, presign: presigner };
  if (s3InitError) throw s3InitError;
  const missing = s3EnvMissing();
  if (missing.length) {
    s3InitError = new Error(`AWS S3 not configured. Missing: ${missing.join(', ')}`);
    throw s3InitError;
  }
  const { S3Client } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  presigner = getSignedUrl;
  return { client: s3Client, presign: presigner };
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
    const storageKey = `users/${userId}/media/${fileId}/${safeName}`;
    try {
      await client.send(new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: storageKey,
        Body: buffer,
        ContentLength: buffer.length,
        ContentType: mime || 'application/octet-stream',
      }));
      const verified = await s3.verify({ storageKey, expectedSize: buffer.length });
      return { storageKey, size: verified.size, provider: 's3', verified: true, etag: verified.etag };
    } catch (error) {
      try { await s3.delete({ storageKey }); } catch {}
      throw error;
    }
  },

  async verify({ storageKey, expectedSize }) {
    const { client } = await getS3();
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
    const result = await client.send(new HeadObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: storageKey }));
    const size = Number(result.ContentLength);
    if (expectedSize !== undefined) assertExpectedSize(size, expectedSize, 's3', storageKey);
    return {
      exists: true,
      size,
      provider: 's3',
      storageKey,
      etag: result.ETag || null,
      contentType: result.ContentType || null,
      lastModified: result.LastModified || null,
    };
  },

  async read({ storageKey }) {
    const { client } = await getS3();
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const result = await client.send(new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: storageKey }));
    const chunks = [];
    for await (const chunk of result.Body) chunks.push(chunk);
    return Buffer.concat(chunks);
  },

  async delete({ storageKey }) {
    const { client } = await getS3();
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    await client.send(new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: storageKey }));
    return true;
  },

  async listUserObjects({ userId, continuationToken = undefined, maxKeys = 1000 }) {
    const { client } = await getS3();
    const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
    const result = await client.send(new ListObjectsV2Command({
      Bucket: process.env.AWS_S3_BUCKET,
      Prefix: `users/${userId}/media/`,
      ContinuationToken: continuationToken,
      MaxKeys: Math.min(Math.max(Number(maxKeys) || 1000, 1), 1000),
    }));
    return {
      objects: (result.Contents || []).map((item) => ({
        storageKey: item.Key,
        size: Number(item.Size || 0),
        lastModified: item.LastModified || null,
      })),
      nextContinuationToken: result.NextContinuationToken || null,
    };
  },

  async getReadUrl({ storageKey, expiresSec = SIGNED_TTL, filename = null, contentType = null }) {
    const { client, presign } = await getS3();
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const params = { Bucket: process.env.AWS_S3_BUCKET, Key: storageKey };
    if (filename) params.ResponseContentDisposition = `attachment; filename="${sanitizeFileName(filename)}"`;
    if (contentType) params.ResponseContentType = contentType;
    return presign(client, new GetObjectCommand(params), { expiresIn: expiresSec });
  },

  async getUploadUrl({ userId, fileId, name, mime, expiresSec = 600 }) {
    const { client, presign } = await getS3();
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const storageKey = `users/${userId}/media/${fileId}/${sanitizeFileName(name || fileId)}`;
    const url = await presign(client, new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: storageKey,
      ContentType: mime || 'application/octet-stream',
    }), { expiresIn: expiresSec });
    return { url, storageKey, provider: 's3' };
  },

  async health() {
    const missing = s3EnvMissing();
    if (missing.length) return { name: 's3', ready: false, lastError: `Missing env: ${missing.join(', ')}` };
    try {
      const { client } = await getS3();
      const { HeadBucketCommand } = await import('@aws-sdk/client-s3');
      await client.send(new HeadBucketCommand({ Bucket: process.env.AWS_S3_BUCKET }));
      const bucket = process.env.AWS_S3_BUCKET || '';
      return {
        name: 's3', ready: true, bucketReachable: true,
        bucket: bucket ? `${bucket.slice(0, 3)}***${bucket.slice(-3)}` : null,
        region: process.env.AWS_REGION || null,
      };
    } catch (error) {
      return { name: 's3', ready: false, bucketReachable: false, lastError: error?.message || String(error) };
    }
  },

  async createMultipartUpload({ userId, fileId, name, mime }) {
    const { client } = await getS3();
    const { CreateMultipartUploadCommand } = await import('@aws-sdk/client-s3');
    const storageKey = `users/${userId}/media/${fileId}/${sanitizeFileName(name || fileId)}`;
    const result = await client.send(new CreateMultipartUploadCommand({
      Bucket: process.env.AWS_S3_BUCKET, Key: storageKey, ContentType: mime || 'application/octet-stream',
    }));
    return { storageKey, uploadId: result.UploadId };
  },

  async signUploadPartUrl({ storageKey, uploadId, partNumber, expiresSec = 600 }) {
    const { client, presign } = await getS3();
    const { UploadPartCommand } = await import('@aws-sdk/client-s3');
    return presign(client, new UploadPartCommand({
      Bucket: process.env.AWS_S3_BUCKET, Key: storageKey, UploadId: uploadId, PartNumber: partNumber,
    }), { expiresIn: expiresSec });
  },

  async completeMultipartUpload({ storageKey, uploadId, parts, expectedSize }) {
    const { client } = await getS3();
    const { CompleteMultipartUploadCommand } = await import('@aws-sdk/client-s3');
    await client.send(new CompleteMultipartUploadCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: storageKey,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    }));
    return s3.verify({ storageKey, expectedSize });
  },

  async abortMultipartUpload({ storageKey, uploadId }) {
    const { client } = await getS3();
    const { AbortMultipartUploadCommand } = await import('@aws-sdk/client-s3');
    return client.send(new AbortMultipartUploadCommand({
      Bucket: process.env.AWS_S3_BUCKET, Key: storageKey, UploadId: uploadId,
    }));
  },
};

const PROVIDERS = { local, s3 };
function pick(provider) { return provider && PROVIDERS[provider] ? PROVIDERS[provider] : (PROVIDERS[ACTIVE] || local); }

export const storage = {
  config: STORAGE_CONFIG,
  active() { return ACTIVE; },
  validateBeforeSave({ size }) {
    if (size > MAX_UPLOAD_BYTES) throw new Error(`File too large. Max ${process.env.MAX_UPLOAD_SIZE_MB || 500} MB.`);
  },
  async save(args) { return pick(ACTIVE).save({ ...args, ext: args.ext || extOf(args.name, args.mime) }); },
  async verify({ provider, storageKey, expectedSize }) { return pick(provider).verify({ storageKey, expectedSize }); },
  async read({ provider, storageKey }) { return pick(provider).read({ storageKey }); },
  async delete({ provider, storageKey }) { return pick(provider).delete({ storageKey }); },
  async listUserObjects(args) {
    if (ACTIVE !== 's3') return { objects: [], nextContinuationToken: null };
    return s3.listUserObjects(args);
  },
  async getReadUrl({ provider, storageKey, ...rest }) {
    const selected = pick(provider);
    return selected.getReadUrl ? selected.getReadUrl({ storageKey, ...rest }) : null;
  },
  async getUploadUrl(args) {
    if (ACTIVE !== 's3') throw new Error('Direct upload URLs require STORAGE_PROVIDER=s3');
    return s3.getUploadUrl(args);
  },
  async health() {
    return { active: ACTIVE, providers: { local: local.health(), s3: await s3.health() } };
  },
};

export const storageProvider = {
  name: ACTIVE,
  save(args) { return storage.save(args); },
  read(storageKey, provider = null) { return storage.read({ provider, storageKey }); },
  delete(storageKey, provider = null) { return storage.delete({ provider, storageKey }); },
};
