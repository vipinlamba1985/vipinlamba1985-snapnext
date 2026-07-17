import fs from 'fs/promises';

function normalizeContentType(value) {
  return String(value || '').split(';')[0].trim().toLowerCase();
}

export function assertVerifiedObject({ expectedSize, expectedContentType, actualSize, actualContentType, storageKey }) {
  if (!storageKey) throw new Error('Storage verification failed: missing storage key.');
  if (!Number.isFinite(actualSize) || actualSize < 0) {
    throw new Error('Storage verification failed: provider did not return a valid object size.');
  }
  if (Number.isFinite(expectedSize) && expectedSize >= 0 && actualSize !== expectedSize) {
    throw new Error(`Storage verification failed: expected ${expectedSize} bytes but found ${actualSize}.`);
  }

  const expected = normalizeContentType(expectedContentType);
  const actual = normalizeContentType(actualContentType);
  if (expected && actual && expected !== actual) {
    throw new Error(`Storage verification failed: expected ${expected} but found ${actual}.`);
  }

  return { verified: true, size: actualSize, contentType: actual || expected || null, storageKey };
}

export async function verifyLocalObject({ fullPath, storageKey, expectedSize, expectedContentType }) {
  const stat = await fs.stat(fullPath);
  if (!stat.isFile()) throw new Error('Storage verification failed: local object is not a file.');
  return assertVerifiedObject({
    expectedSize,
    expectedContentType,
    actualSize: stat.size,
    actualContentType: expectedContentType,
    storageKey,
  });
}

export async function verifyS3Object({ client, bucket, storageKey, expectedSize, expectedContentType }) {
  const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
  const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: storageKey }));
  return assertVerifiedObject({
    expectedSize,
    expectedContentType,
    actualSize: Number(result.ContentLength),
    actualContentType: result.ContentType,
    storageKey,
  });
}
