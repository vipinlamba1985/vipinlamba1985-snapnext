import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { cleanCluster, isGenericIdentityLabel } from '@/lib/people-intelligence';
import { peopleIntelligenceReady } from '@/lib/people-intelligence.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cleanText(value, max = 200) {
  return String(value || '').trim().slice(0, max);
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = await getDb();
  const rows = await db.collection('person_clusters').find({
    userId: user.id,
    status: { $ne: 'hidden' },
    representativeMediaId: { $exists: true, $ne: null },
  }).sort({ representativeQuality: -1, updatedAt: -1 }).limit(1000).toArray();

  return NextResponse.json({
    people: rows.map(cleanCluster),
    engineReady: peopleIntelligenceReady(),
    source: 'face_clusters',
  });
}

export async function PATCH(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const clusterId = cleanText(body.clusterId, 120);
  if (!clusterId) return NextResponse.json({ error: 'clusterId is required' }, { status: 400 });

  const db = await getDb();

  if (body.action === 'hide') {
    const result = await db.collection('person_clusters').findOneAndUpdate(
      { userId: user.id, clusterId },
      { $set: { status: 'hidden', updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
    if (!result) return NextResponse.json({ error: 'Person cluster not found' }, { status: 404 });
    return NextResponse.json({ ok: true, hidden: true });
  }

  if (body.action === 'merge') {
    const targetClusterId = cleanText(body.targetClusterId, 120);
    if (!targetClusterId || targetClusterId === clusterId) return NextResponse.json({ error: 'Choose another person to merge with.' }, { status: 400 });

    const [source, target] = await Promise.all([
      db.collection('person_clusters').findOne({ userId: user.id, clusterId }),
      db.collection('person_clusters').findOne({ userId: user.id, clusterId: targetClusterId }),
    ]);
    if (!source || !target) return NextResponse.json({ error: 'Person cluster not found' }, { status: 404 });

    const mediaIds = Array.from(new Set([...(target.mediaIds || []), ...(source.mediaIds || [])]));
    const faceIds = Array.from(new Set([...(target.faceIds || []), ...(source.faceIds || [])]));
    const sourceWinsRepresentative = Number(source.representativeQuality || 0) > Number(target.representativeQuality || 0) && !target.thumbnailOverride;

    const targetSet = {
      mediaIds,
      faceIds,
      updatedAt: new Date(),
      ...(sourceWinsRepresentative ? {
        representativeMediaId: source.representativeMediaId,
        representativeFaceId: source.representativeFaceId,
        representativeFaceBox: source.representativeFaceBox,
        representativeQuality: source.representativeQuality,
      } : {}),
    };

    await Promise.all([
      db.collection('person_clusters').updateOne({ userId: user.id, clusterId: targetClusterId }, { $set: targetSet }),
      db.collection('face_index').updateMany({ userId: user.id, clusterId }, { $set: { clusterId: targetClusterId } }),
      db.collection('media').updateMany(
        { userId: user.id, 'peopleIntelligence.clusterIds': clusterId },
        { $set: { 'peopleIntelligence.updatedAt': new Date() }, $pull: { 'peopleIntelligence.clusterIds': clusterId }, $addToSet: { 'peopleIntelligence.clusterIds': targetClusterId } },
      ),
      db.collection('person_clusters').deleteOne({ userId: user.id, clusterId }),
    ]);

    const merged = await db.collection('person_clusters').findOne({ userId: user.id, clusterId: targetClusterId });
    return NextResponse.json({ ok: true, mergedInto: targetClusterId, person: cleanCluster(merged) });
  }

  const update = { updatedAt: new Date() };

  if (body.displayName !== undefined) {
    const displayName = cleanText(body.displayName, 80);
    if (!displayName || isGenericIdentityLabel(displayName)) {
      return NextResponse.json({ error: 'Choose a real name or relationship label.' }, { status: 400 });
    }
    update.displayName = displayName;
  }

  if (body.relationship !== undefined) update.relationship = cleanText(body.relationship, 60);
  if (body.birthday !== undefined) update.birthday = cleanText(body.birthday, 40);
  if (body.phone !== undefined) update.phone = cleanText(body.phone, 60);
  if (body.email !== undefined) update.email = cleanText(body.email, 160).toLowerCase();
  if (body.notes !== undefined) update.notes = cleanText(body.notes, 1000);

  if (body.representativeMediaId !== undefined) {
    const representativeMediaId = cleanText(body.representativeMediaId, 120);
    const cluster = await db.collection('person_clusters').findOne({ userId: user.id, clusterId, mediaIds: representativeMediaId });
    if (!cluster) return NextResponse.json({ error: 'That photo is not part of this person profile.' }, { status: 400 });
    update.representativeMediaId = representativeMediaId;
  }

  if (body.thumbnailOverride !== undefined) {
    const value = body.thumbnailOverride;
    if (value === null) update.thumbnailOverride = null;
    else update.thumbnailOverride = {
      scale: Math.max(1, Math.min(8, Number(value?.scale || 1))),
      offsetX: Math.max(-100, Math.min(100, Number(value?.offsetX || 0))),
      offsetY: Math.max(-100, Math.min(100, Number(value?.offsetY || 0))),
    };
  }

  if (Object.keys(update).length === 1) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const result = await db.collection('person_clusters').findOneAndUpdate(
    { userId: user.id, clusterId },
    { $set: update },
    { returnDocument: 'after' },
  );
  if (!result) return NextResponse.json({ error: 'Person cluster not found' }, { status: 404 });
  return NextResponse.json({ ok: true, person: cleanCluster(result) });
}
