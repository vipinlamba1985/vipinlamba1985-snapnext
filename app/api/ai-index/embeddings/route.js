export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { aiIndexAccess } from '@/lib/ai-index-access';
import { ASSET_INTELLIGENCE_PIPELINE_VERSION } from '@/lib/asset-intelligence-version';
import { EMBEDDING_VERSION, buildEmbeddingText, isWorthEmbedding } from '@/lib/search-embeddings';
import { embedTexts, smartSearchConfigured } from '@/lib/search-embeddings.server';

/**
 * Photos embedded per request.
 *
 * Deliberately small and caller-driven, in the same spirit as PEOPLE_COST_POLICY:
 * indexing a library happens as a series of bounded, individually metered
 * batches rather than one unbounded loop that could run up a bill unattended.
 */
const MAX_BATCH = 100;

/** GET — how much of the library is indexed, so the UI can show honest progress. */
export async function GET(request) {
  const user = await getUserFromRequest(request);
  const access = aiIndexAccess({ user, request });
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const db = await getDb();
  const [total, indexed] = await Promise.all([
    db.collection('media').countDocuments({ userId: user.id, trashed: { $ne: true } }),
    db.collection('media_embeddings').countDocuments({ userId: user.id, version: EMBEDDING_VERSION }),
  ]);

  return Response.json({
    ok: true,
    configured: smartSearchConfigured(),
    version: EMBEDDING_VERSION,
    total,
    indexed,
    remaining: Math.max(0, total - indexed),
  });
}

/** POST — embed the next batch of un-indexed photos. */
export async function POST(request) {
  const user = await getUserFromRequest(request);
  const access = aiIndexAccess({ user, request });
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  if (!smartSearchConfigured()) {
    return Response.json(
      { error: { code: 'smart_search_not_configured', message: 'Smart search is not switched on for this deployment.' } },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const batchSize = Math.max(1, Math.min(MAX_BATCH, Number(body.batchSize) || 25));
  const db = await getDb();

  const alreadyIndexed = await db.collection('media_embeddings')
    .find({ userId: user.id, version: EMBEDDING_VERSION }, { projection: { mediaId: 1, _id: 0 } })
    .toArray();
  const skip = new Set(alreadyIndexed.map((row) => row.mediaId));

  // Over-fetch, because assets without enough description are skipped for free.
  const candidates = await db.collection('media')
    .find({ userId: user.id, trashed: { $ne: true } })
    .sort({ createdAt: -1 })
    .limit(batchSize * 4)
    .toArray();

  const pending = candidates.filter((item) => !skip.has(item.id));
  if (!pending.length) return Response.json({ ok: true, embedded: 0, remaining: 0, done: true });

  const intelligence = await db.collection('asset_intelligence').find({
    userId: user.id,
    mediaId: { $in: pending.map((item) => item.id) },
    pipelineVersion: ASSET_INTELLIGENCE_PIPELINE_VERSION,
  }).toArray();
  const intelligenceById = new Map(intelligence.map((item) => [item.mediaId, item]));

  const batch = [];
  for (const item of pending) {
    if (batch.length >= batchSize) break;
    const record = intelligenceById.get(item.id) || null;
    // Photos the enrichment pipeline has not described yet have nothing worth
    // embedding. Spending on them would buy a vector of the filename.
    if (!isWorthEmbedding(item, record)) continue;
    batch.push({ id: item.id, text: buildEmbeddingText(item, record) });
  }

  if (!batch.length) {
    return Response.json({ ok: true, embedded: 0, skipped: pending.length, needsEnrichment: true });
  }

  const result = await embedTexts({
    db,
    user,
    request,
    texts: batch.map((entry) => entry.text),
    feature: 'smart_search_index',
    metadata: { batchSize: batch.length },
  });

  if (!result.ok) {
    return Response.json(
      { error: { code: result.reason || 'embedding_failed', message: 'Could not index this batch. Nothing was charged.' } },
      { status: result.reason === 'provider_error' ? 502 : 402 },
    );
  }

  const now = new Date();
  await db.collection('media_embeddings').bulkWrite(batch.map((entry, index) => ({
    updateOne: {
      filter: { userId: user.id, mediaId: entry.id },
      update: {
        $set: {
          userId: user.id,
          mediaId: entry.id,
          vector: result.vectors[index],
          version: EMBEDDING_VERSION,
          updatedAt: now,
        },
      },
      upsert: true,
    },
  })));

  const [total, indexed] = await Promise.all([
    db.collection('media').countDocuments({ userId: user.id, trashed: { $ne: true } }),
    db.collection('media_embeddings').countDocuments({ userId: user.id, version: EMBEDDING_VERSION }),
  ]);

  return Response.json({
    ok: true,
    embedded: batch.length,
    costUsd: Number((result.costUsd || 0).toFixed(6)),
    indexed,
    remaining: Math.max(0, total - indexed),
    done: indexed >= total,
  });
}
