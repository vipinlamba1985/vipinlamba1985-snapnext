export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { aiIndexAccess } from '@/lib/ai-index-access';
import { searchAssetIntelligence } from '@/lib/ai-memory-retrieval';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  const access = aiIndexAccess({ user, request });
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const url = new URL(request.url);
  const query = String(url.searchParams.get('q') || '').trim();
  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get('limit')) || 20));
  if (!query) return Response.json({ error: { code: 'query_required', message: 'Search text is required.' } }, { status: 400 });
  if (query.length > 500) return Response.json({ error: { code: 'query_too_long', message: 'Keep searches under 500 characters.' } }, { status: 400 });

  const db = await getDb();
  const results = await searchAssetIntelligence({ db, userId: user.id, query, limit });
  return Response.json({ ok: true, query, count: results.length, results });
}
