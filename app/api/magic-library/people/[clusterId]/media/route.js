import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { annotatePersonMedia } from '@/lib/people-gallery-rules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_PERSON_MEDIA = 2000;

function cleanMedia(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return rest;
}

export async function GET(request, context) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = await context.params;
  const clusterId = String(params?.clusterId || '').trim();
  if (!clusterId) return NextResponse.json({ error: 'clusterId is required' }, { status: 400 });

  const db = await getDb();
  const [person, activation] = await Promise.all([
    db.collection('person_clusters').findOne({
      userId: user.id,
      clusterId,
      status: { $nin: ['hidden', 'rejected', 'legacy'] },
    }),
    db.collection('magic_library_activation').findOne({ userId: user.id }),
  ]);
  if (!person) return NextResponse.json({ error: 'Person not found' }, { status: 404 });

  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get('limit') || MAX_PERSON_MEDIA);
  const limit = Math.max(1, Math.min(MAX_PERSON_MEDIA, Number.isFinite(requestedLimit) ? requestedLimit : MAX_PERSON_MEDIA));
  const query = {
    userId: user.id,
    trashed: { $ne: true },
    'peopleIntelligence.clusterIds': clusterId,
  };

  const [items, total] = await Promise.all([
    db.collection('media').find(query).sort({ createdAt: -1 }).limit(limit).toArray(),
    db.collection('media').countDocuments(query),
  ]);
  const activeClusterIds = activation?.active || [];
  const classifiedItems = items.map((item) => annotatePersonMedia(cleanMedia(item), {
    selectedClusterId: clusterId,
    activeClusterIds,
  }));

  return NextResponse.json({
    person: clusterId,
    items: classifiedItems,
    total,
    loaded: classifiedItems.length,
    truncated: total > classifiedItems.length,
    sections: {
      bestEligible: classifiedItems.filter((item) => item.peopleContext?.bestEligible).length,
      groupPhotos: classifiedItems.filter((item) => item.peopleContext?.groupPhoto).length,
      largeGroupsExcludedFromBest: classifiedItems.filter((item) => item.peopleContext?.largeGroupPhoto && !item.peopleContext?.bestEligible).length,
    },
  });
}
