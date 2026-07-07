export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { aiIndexAccess } from '@/lib/ai-index-access';
import { enqueueAssetAnalysis } from '@/lib/analysis-queue';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  const access = aiIndexAccess({ user, request });
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const body = await request.json().catch(() => ({}));
  const input = Array.isArray(body.mediaIds) ? body.mediaIds : body.mediaId ? [body.mediaId] : [];
  const mediaIds = [...new Set(input.map((value) => String(value || '').trim()).filter(Boolean))].slice(0, 50);
  if (!mediaIds.length) return Response.json({ error: { code: 'media_required', message: 'Choose at least one saved asset to index.' } }, { status: 400 });

  const db = await getDb();
  const media = await db.collection('media').find({ id: { $in: mediaIds }, userId: user.id, trashed: { $ne: true } }).toArray();
  const results = [];
  for (const item of media) {
    results.push(await enqueueAssetAnalysis({ db, media: item, reason: 'user_request', priority: 60 }));
  }

  return Response.json({ ok: true, requested: mediaIds.length, accepted: results.length, results });
}
