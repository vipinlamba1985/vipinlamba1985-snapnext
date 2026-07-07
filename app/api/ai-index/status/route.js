export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { aiIndexAccess } from '@/lib/ai-index-access';
import { getAnalysisStatus } from '@/lib/universal-ai-index';

function clean(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return rest;
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  const access = aiIndexAccess({ user, request });
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const mediaId = new URL(request.url).searchParams.get('mediaId') || null;
  const db = await getDb();
  const result = await getAnalysisStatus({ db, userId: user.id, mediaId });

  if (mediaId) {
    return Response.json({ ok: true, intelligence: clean(result.intelligence), job: clean(result.job) });
  }

  return Response.json({
    ok: true,
    jobs: result.jobs,
    intelligence: result.intelligence,
    recent: (result.recent || []).map(clean),
  });
}
