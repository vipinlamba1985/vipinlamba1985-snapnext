const MAX_PARTS = 50;

function s3Config(env = process.env) {
  const missing = [];
  if (!env.AWS_ACCESS_KEY_ID) missing.push('AWS_ACCESS_KEY_ID');
  if (!env.AWS_SECRET_ACCESS_KEY) missing.push('AWS_SECRET_ACCESS_KEY');
  if (!env.AWS_REGION) missing.push('AWS_REGION');
  if (!env.AWS_S3_BUCKET) missing.push('AWS_S3_BUCKET');
  if (missing.length) {
    const error = new Error(`AWS S3 not configured. Missing: ${missing.join(', ')}`);
    error.code = 'render_s3_not_configured';
    throw error;
  }
  return {
    region: env.AWS_REGION,
    bucket: env.AWS_S3_BUCKET,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  };
}

async function s3(env = process.env) {
  const { S3Client } = await import('@aws-sdk/client-s3');
  const config = s3Config(env);
  return {
    client: new S3Client({ region: config.region, credentials: config.credentials }),
    bucket: config.bucket,
  };
}

function canonicalKey(storageKey) {
  const key = String(storageKey || '');
  if (!/^renders\/[a-f0-9]{32}\/[a-f0-9]{64}\.mp4$/.test(key)) {
    const error = new Error('Invalid canonical render storage key.');
    error.code = 'render_storage_key_invalid';
    throw error;
  }
  return key;
}

function noSuchUpload(error) {
  const status = Number(error?.$metadata?.httpStatusCode || error?.statusCode || error?.status);
  return status === 404 || error?.name === 'NoSuchUpload' || error?.Code === 'NoSuchUpload' || error?.code === 'NoSuchUpload';
}

export async function createCanonicalRenderMultipartUpload({ storageKey, env = process.env }) {
  const key = canonicalKey(storageKey);
  const { client, bucket } = await s3(env);
  const { CreateMultipartUploadCommand } = await import('@aws-sdk/client-s3');
  const result = await client.send(new CreateMultipartUploadCommand({
    Bucket: bucket,
    Key: key,
    ContentType: 'video/mp4',
  }));
  if (!result.UploadId) {
    const error = new Error('S3 did not return a multipart upload id.');
    error.code = 'render_multipart_create_failed';
    throw error;
  }
  return { uploadId: result.UploadId, storageKey: key };
}

export async function signCanonicalRenderMultipartParts({
  storageKey,
  uploadId,
  partCount,
  expiresSec = 10 * 60,
  env = process.env,
}) {
  const key = canonicalKey(storageKey);
  const count = Math.floor(Number(partCount));
  if (!uploadId || !Number.isFinite(count) || count < 1 || count > MAX_PARTS) {
    const error = new Error('Invalid canonical render multipart plan.');
    error.code = 'render_multipart_plan_invalid';
    throw error;
  }
  const { client, bucket } = await s3(env);
  const { UploadPartCommand } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const parts = [];
  for (let partNumber = 1; partNumber <= count; partNumber += 1) {
    const url = await getSignedUrl(client, new UploadPartCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    }), { expiresIn: expiresSec });
    parts.push({ partNumber, url });
  }
  return parts;
}

function normalizedCompletedParts(parts = []) {
  if (!Array.isArray(parts) || !parts.length || parts.length > MAX_PARTS) {
    const error = new Error('Multipart completion requires a bounded part list.');
    error.code = 'render_multipart_parts_invalid';
    throw error;
  }
  const normalized = parts.map(part => ({
    PartNumber: Math.floor(Number(part.partNumber ?? part.PartNumber)),
    ETag: String(part.etag ?? part.ETag ?? '').trim(),
  })).sort((a, b) => a.PartNumber - b.PartNumber);
  for (let index = 0; index < normalized.length; index += 1) {
    const part = normalized[index];
    if (part.PartNumber !== index + 1 || !part.ETag || part.ETag.length > 300) {
      const error = new Error('Multipart completion parts must be contiguous and include ETags.');
      error.code = 'render_multipart_parts_invalid';
      throw error;
    }
  }
  return normalized;
}

export async function completeCanonicalRenderMultipartUpload({
  storageKey,
  uploadId,
  parts,
  env = process.env,
}) {
  const key = canonicalKey(storageKey);
  if (!uploadId) {
    const error = new Error('Multipart upload id is required.');
    error.code = 'render_multipart_upload_missing';
    throw error;
  }
  const completedParts = normalizedCompletedParts(parts);
  const { client, bucket } = await s3(env);
  const { CompleteMultipartUploadCommand } = await import('@aws-sdk/client-s3');
  const result = await client.send(new CompleteMultipartUploadCommand({
    Bucket: bucket,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: { Parts: completedParts },
  }));
  return { storageKey: key, etag: result.ETag || null };
}

export async function abortCanonicalRenderMultipartUpload({
  storageKey,
  uploadId,
  env = process.env,
}) {
  if (!uploadId) return { aborted: false, missing: true };
  const key = canonicalKey(storageKey);
  const { client, bucket } = await s3(env);
  const { AbortMultipartUploadCommand } = await import('@aws-sdk/client-s3');
  try {
    await client.send(new AbortMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
    }));
    return { aborted: true, missing: false };
  } catch (error) {
    if (noSuchUpload(error)) return { aborted: false, missing: true };
    throw error;
  }
}

export async function abortAllCanonicalRenderMultipartUploadsForKey({ storageKey, env = process.env }) {
  const key = canonicalKey(storageKey);
  const { client, bucket } = await s3(env);
  const { ListMultipartUploadsCommand, AbortMultipartUploadCommand } = await import('@aws-sdk/client-s3');
  let keyMarker;
  let uploadIdMarker;
  let aborted = 0;
  do {
    const page = await client.send(new ListMultipartUploadsCommand({
      Bucket: bucket,
      Prefix: key,
      KeyMarker: keyMarker,
      UploadIdMarker: uploadIdMarker,
      MaxUploads: 100,
    }));
    const uploads = (page.Uploads || []).filter(upload => upload.Key === key && upload.UploadId);
    for (const upload of uploads) {
      try {
        await client.send(new AbortMultipartUploadCommand({
          Bucket: bucket,
          Key: key,
          UploadId: upload.UploadId,
        }));
        aborted += 1;
      } catch (error) {
        if (!noSuchUpload(error)) throw error;
      }
    }
    keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
    uploadIdMarker = page.IsTruncated ? page.NextUploadIdMarker : undefined;
    if (!page.IsTruncated) break;
  } while (keyMarker || uploadIdMarker);
  return { aborted };
}
