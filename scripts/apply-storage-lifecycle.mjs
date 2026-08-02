#!/usr/bin/env node
// Applies the S3 lifecycle policy that moves old originals to cheaper storage.
//
//   node scripts/apply-storage-lifecycle.mjs --dry-run   # print the policy
//   node scripts/apply-storage-lifecycle.mjs             # apply it
//
// Safe to run repeatedly: PutBucketLifecycleConfiguration replaces the whole
// configuration with the same rules each time. It changes storage class only —
// no object is ever deleted, moved between buckets, or rewritten.

import { mediaLifecycleConfiguration, projectedMonthlySaving } from '../lib/storage-lifecycle.js';

const dryRun = process.argv.includes('--dry-run');
const bucket = process.env.S3_BUCKET;

const configuration = mediaLifecycleConfiguration({
  originalsPrefix: process.env.S3_ORIGINALS_PREFIX || 'originals/',
  derivativesPrefix: process.env.S3_DERIVATIVES_PREFIX || 'thumbs/',
});

console.log(JSON.stringify(configuration, null, 2));

const example = projectedMonthlySaving({ totalGb: 1000, agedFraction: 0.7 });
console.log(
  `\nFor 1 TB with 70% older than a year: $${example.beforeUsd}/mo -> $${example.afterUsd}/mo `
  + `(saves $${example.savedUsd}/mo, ${example.savedPercent}%).`,
);

if (dryRun) {
  console.log('\nDry run — nothing was applied.');
  process.exit(0);
}

if (!bucket) {
  console.error('\nS3_BUCKET is not set. Refusing to guess which bucket to modify.');
  process.exit(1);
}

const { S3Client, PutBucketLifecycleConfigurationCommand } = await import('@aws-sdk/client-s3');
const client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID
    ? { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }
    : undefined,
});

await client.send(new PutBucketLifecycleConfigurationCommand({
  Bucket: bucket,
  LifecycleConfiguration: configuration,
}));

console.log(`\nApplied to ${bucket}. Existing objects are evaluated on S3's daily cycle.`);
