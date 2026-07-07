import { ListPartsCommand, S3Client } from '@aws-sdk/client-s3';

let client;

function s3() {
  if (!client) {
    client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
}

export async function listUploadedParts({ storageKey, uploadId }) {
  const parts = [];
  let partNumberMarker;
  do {
    const result = await s3().send(new ListPartsCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: storageKey,
      UploadId: uploadId,
      PartNumberMarker: partNumberMarker,
    }));
    for (const part of result.Parts || []) {
      if (part.PartNumber && part.ETag) parts.push({ partNumber: part.PartNumber, etag: part.ETag, size: Number(part.Size || 0) });
    }
    partNumberMarker = result.IsTruncated ? result.NextPartNumberMarker : undefined;
  } while (partNumberMarker);
  return parts.sort((a, b) => a.partNumber - b.partNumber);
}
