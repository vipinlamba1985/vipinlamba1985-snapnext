import fs from 'fs/promises';
import path from 'path';

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads';

function s3Config() {
  const missing = [];
  if (!process.env.AWS_ACCESS_KEY_ID) missing.push('AWS_ACCESS_KEY_ID');
  if (!process.env.AWS_SECRET_ACCESS_KEY) missing.push('AWS_SECRET_ACCESS_KEY');
  if (!process.env.AWS_REGION) missing.push('AWS_REGION');
  if (!process.env.AWS_S3_BUCKET) missing.push('AWS_S3_BUCKET');
  if (missing.length) throw new Error(`AWS S3 not configured. Missing: ${missing.join(', ')}`);
  return {
    region: process.env.AWS_REGION,
    bucket: process.env.AWS_S3_BUCKET,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  };
}

async function s3Client() {
  const { S3Client } = await import('@aws-sdk/client-s3');
  const config = s3Config();
  return { client: new S3Client({ region: config.region, credentials: config.credentials }), bucket: config.bucket };
}

async function deleteLocalStrict(storageKey) {
  try {
    await fs.unlink(path.join(UPLOAD_DIR, storageKey));
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
}

function isNoSuchUpload(error) {
  const status = Number(error?.$metadata?.httpStatusCode || error?.statusCode || error?.status);
  return status === 404
    || error?.name === 'NoSuchUpload'
    || error?.Code === 'NoSuchUpload'
    || error?.code === 'NoSuchUpload';
}

async function abortS3MultipartUploadsForKey({ client, bucket, storageKey }) {
  const { ListMultipartUploadsCommand, AbortMultipartUploadCommand } = await import('@aws-sdk/client-s3');
  let keyMarker;
  let uploadIdMarker;
  do {
    const page = await client.send(new ListMultipartUploadsCommand({
      Bucket: bucket,
      Prefix: storageKey,
      KeyMarker: keyMarker,
      UploadIdMarker: uploadIdMarker,
      MaxUploads: 100,
    }));
    const uploads = (page.Uploads || []).filter(upload => upload.Key === storageKey && upload.UploadId);
    for (const upload of uploads) {
      try {
        await client.send(new AbortMultipartUploadCommand({
          Bucket: bucket,
          Key: storageKey,
          UploadId: upload.UploadId,
        }));
      } catch (error) {
        if (!isNoSuchUpload(error)) throw error;
      }
    }
    if (!page.IsTruncated) break;
    keyMarker = page.NextKeyMarker;
    uploadIdMarker = page.NextUploadIdMarker;
  } while (keyMarker || uploadIdMarker);
}

async function deleteS3Strict(storageKey) {
  const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  const { client, bucket } = await s3Client();
  // Canonical Reel multipart uploads are future-write capabilities. Revoke them
  // before deleting the final object. Ordinary media deletion keeps its existing
  // S3 permission surface and is not forced through multipart listing.
  if (String(storageKey).startsWith('renders/')) {
    await abortS3MultipartUploadsForKey({ client, bucket, storageKey });
  }
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: storageKey }));
}

function isS3Missing(error) {
  const status = Number(error?.$metadata?.httpStatusCode || error?.statusCode || error?.status);
  return status === 404
    || error?.name === 'NotFound'
    || error?.name === 'NoSuchKey'
    || error?.Code === 'NoSuchKey'
    || error?.code === 'NoSuchKey';
}

async function verifyLocalAbsent(storageKey) {
  try {
    await fs.stat(path.join(UPLOAD_DIR, storageKey));
    return false;
  } catch (error) {
    if (error?.code === 'ENOENT') return true;
    throw error;
  }
}

async function verifyS3Absent(storageKey) {
  const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
  const { client, bucket } = await s3Client();
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: storageKey }));
    return false;
  } catch (error) {
    if (isS3Missing(error)) return true;
    throw error;
  }
}

export async function verifyStoredMediaAbsent({ provider = 'local', storageKey }) {
  if (!storageKey) return { verifiedAbsent: true, provider, storageKey: '' };
  const verifiedAbsent = provider === 's3'
    ? await verifyS3Absent(storageKey)
    : await verifyLocalAbsent(storageKey);
  return { verifiedAbsent, provider, storageKey };
}

export async function deleteStoredMediaStrict({ provider = 'local', storageKey }) {
  if (!storageKey) return;
  if (provider === 's3') return deleteS3Strict(storageKey);
  return deleteLocalStrict(storageKey);
}

export async function deleteStoredMediaVerified({ provider = 'local', storageKey }) {
  if (!storageKey) return { verifiedAbsent: true, provider, storageKey: '' };
  await deleteStoredMediaStrict({ provider, storageKey });
  const verification = await verifyStoredMediaAbsent({ provider, storageKey });
  if (!verification.verifiedAbsent) {
    const error = new Error('Storage deletion could not be verified.');
    error.code = 'storage_deletion_verification_failed';
    error.provider = provider;
    error.storageKey = storageKey;
    throw error;
  }
  return verification;
}
