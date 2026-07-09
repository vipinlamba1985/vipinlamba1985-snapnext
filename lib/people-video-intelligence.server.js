import { peopleRekognition } from '@/lib/people-rekognition-capabilities.server';
import { PEOPLE_COST_POLICY, estimateVideoRunCost } from '@/lib/people-rekognition-capabilities';

function assertVideoGate(estimatedMinutes) {
  if (!PEOPLE_COST_POLICY.videoEnabled) {
    const error = new Error('Video People Magic is disabled until the business cost gate is enabled.');
    error.code = 'people_video_disabled';
    throw error;
  }
  const estimatedCost = estimateVideoRunCost(estimatedMinutes);
  if (estimatedCost > PEOPLE_COST_POLICY.maxEstimatedUsdPerVideoRun) {
    const error = new Error('Video People Magic exceeds the configured cost safety limit.');
    error.code = 'people_video_cost_guard_blocked';
    error.estimatedCost = estimatedCost;
    error.maxAllowed = PEOPLE_COST_POLICY.maxEstimatedUsdPerVideoRun;
    throw error;
  }
  return estimatedCost;
}

export async function startVideoFaceDetection({ bucket, key, estimatedMinutes = 1, notificationChannel, jobTag }) {
  const estimatedCost = assertVideoGate(estimatedMinutes);
  const result = await peopleRekognition.startFaceDetection({
    Video: { S3Object: { Bucket: bucket, Name: key } },
    ...(notificationChannel ? { NotificationChannel: notificationChannel } : {}),
    ...(jobTag ? { JobTag: jobTag } : {}),
    FaceAttributes: 'DEFAULT',
  });
  return { jobId: result.JobId, estimatedCost };
}

export async function getVideoFaceDetection({ jobId, nextToken, maxResults = 1000 }) {
  return peopleRekognition.getFaceDetection({
    JobId: jobId,
    MaxResults: Math.max(1, Math.min(1000, Number(maxResults || 1000))),
    ...(nextToken ? { NextToken: nextToken } : {}),
    SortBy: 'TIMESTAMP',
  });
}

export async function startVideoFaceSearch({ bucket, key, collectionId, estimatedMinutes = 1, notificationChannel, jobTag }) {
  const estimatedCost = assertVideoGate(estimatedMinutes);
  const result = await peopleRekognition.startFaceSearch({
    Video: { S3Object: { Bucket: bucket, Name: key } },
    CollectionId: collectionId,
    FaceMatchThreshold: Number(process.env.PEOPLE_VIDEO_FACE_MATCH_THRESHOLD || 92),
    ...(notificationChannel ? { NotificationChannel: notificationChannel } : {}),
    ...(jobTag ? { JobTag: jobTag } : {}),
  });
  return { jobId: result.JobId, estimatedCost };
}

export async function getVideoFaceSearch({ jobId, nextToken, maxResults = 1000 }) {
  return peopleRekognition.getFaceSearch({
    JobId: jobId,
    MaxResults: Math.max(1, Math.min(1000, Number(maxResults || 1000))),
    ...(nextToken ? { NextToken: nextToken } : {}),
    SortBy: 'TIMESTAMP',
  });
}
