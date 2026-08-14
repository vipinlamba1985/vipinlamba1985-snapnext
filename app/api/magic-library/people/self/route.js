import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { PEOPLE_INTELLIGENCE_VERSION, isUsableFaceBox } from '@/lib/people-intelligence';
import { mediaCategory } from '@/lib/media-category';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}

/**
 * User-confirmed self identity.
 *
 * This route deliberately performs no face search, AWS Rekognition call, AI
 * provider call, or automatic identity inference. It only records the user's
 * explicit choice of one already-visible current People cluster.
 */
export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const body = await request.json().catch(() => ({}));
  const clusterId = String(body.clusterId || '').trim();
  if (!clusterId || clusterId.length > 160) return json({ error: 'Choose a valid person.' }, 400);

  const db = await getDb();
  const person = await db.collection('person_clusters').findOne({
    userId: user.id,
    clusterId,
    indexVersion: PEOPLE_INTELLIGENCE_VERSION,
    status: { $nin: ['hidden', 'rejected', 'legacy'] },
    identityState: { $ne: 'unknown' },
    representativeMediaId: { $exists: true, $ne: null },
    representativeFaceBox: { $exists: true, $ne: null },
  });

  if (!person || !isUsableFaceBox(person.representativeFaceBox)) {
    return json({ error: 'That face is not available for confirmation.' }, 404);
  }

  // A screenshot, document, meme, or app capture must never become the default
  // "You" portrait just because it happened to contain a detectable face.
  const representative = await db.collection('media').findOne({
    userId: user.id,
    id: person.representativeMediaId,
    trashed: { $ne: true },
  });
  if (!representative || mediaCategory(representative) !== 'photos') {
    return json({ error: 'Choose a face from a real photo, not a screenshot or document.' }, 400);
  }

  const now = new Date();
  await db.collection('person_clusters').updateMany(
    { userId: user.id, clusterId: { $ne: clusterId }, isSelf: true },
    {
      $unset: { isSelf: '' },
      $set: { updatedAt: now },
    },
  );

  const result = await db.collection('person_clusters').updateOne(
    { userId: user.id, clusterId, indexVersion: PEOPLE_INTELLIGENCE_VERSION },
    {
      $set: {
        isSelf: true,
        displayName: 'You',
        identityState: 'person',
        verificationStatus: 'confirmed',
        selfConfirmationSource: 'user_explicit_picker',
        selfConfirmedAt: now,
        updatedAt: now,
      },
    },
  );

  if (!result.matchedCount) return json({ error: 'Could not confirm this person.' }, 409);

  return json({
    ok: true,
    clusterId,
    displayName: 'You',
    explicitConfirmation: true,
    cloudRecognitionChanged: false,
    autoShare: false,
  });
}
