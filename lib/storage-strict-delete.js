import fs from 'fs/promises';
import path from 'path';

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads';

async function deleteLocalStrict(storageKey) {
  try {
    await fs.unlink(path.join(UPLOAD_DIR, storageKey));
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
}

async function deleteS3Strict(storageKey) {
  const missing = [];
  if (!process.env.AWS_ACCESS_KEY_ID) missing.push('AWS_ACCESS_KEY_ID');
  if (!process.env.AWS_SECRET_ACCESS_KEY) missing.push('AWS_SECRET_ACCESS_KEY');
  if (!process.env.AWS_REGION) missing.push('AWS_REGION');
  if (!process.env.AWS_S3_BUCKET) missing.push('AWS_S3_BUCKET');
  if (missing.length) throw new Error(`AWS S3 not configured. Missing: ${missing.join(', ')}`);

  const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  await client.send(new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: storageKey }));
}

export async function deleteStoredMediaStrict({ provider = 'local', storageKey }) {
  if (!storageKey) return;
  if (provider === 's3') return deleteS3Strict(storageKey);
  return deleteLocalStrict(storageKey);
}
