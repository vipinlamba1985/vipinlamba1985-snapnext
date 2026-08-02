// The only part of smart search that calls a model, and therefore the only part
// that costs money. Every call reserves through lib/ai-spend-gate.js first and
// settles or releases afterwards, as lib/creative-credits.js requires of any
// `ai_credits` feature.
//
// Nothing here reads an image. It embeds text that the enrichment pipeline
// already produced and stored, which is why indexing a whole library costs
// cents rather than the price of re-analysing it.

import { reserveExternalAiSpend, settleExternalAiSpend, releaseExternalAiSpend } from '@/lib/ai-spend-gate';
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  EMBEDDING_VERSION,
  estimateEmbeddingCostUsd,
  normalizeVector,
} from '@/lib/search-embeddings';

const EMBEDDING_ENDPOINT = 'https://api.openai.com/v1/embeddings';

/** Smart search stays off unless a key is present — it must never half-work. */
export function smartSearchConfigured() {
  return Boolean(process.env.OPENAI_API_KEY) && process.env.SMART_SEARCH_ENABLED !== 'false';
}

async function callEmbeddingProvider(texts) {
  const response = await fetch(EMBEDDING_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.SMART_SEARCH_EMBEDDING_MODEL || EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
      input: texts,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding provider returned ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }

  const data = await response.json();
  const vectors = (data.data || [])
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map(entry => normalizeVector(entry.embedding || []));

  if (vectors.length !== texts.length) {
    throw new Error(`Embedding provider returned ${vectors.length} vectors for ${texts.length} inputs.`);
  }
  return { vectors, usage: data.usage || null };
}

/**
 * Embeds texts, metered end to end.
 *
 * Returns `{ ok: false, gate }` rather than throwing when the spend gate
 * declines, so callers can degrade to keyword search instead of failing the
 * user's search outright.
 */
export async function embedTexts({ db, user, request = null, texts = [], feature = 'smart_search_index', metadata = {} }) {
  const inputs = (Array.isArray(texts) ? texts : []).map(text => String(text || '').trim()).filter(Boolean);
  if (!inputs.length) return { ok: true, vectors: [], costUsd: 0 };
  if (!smartSearchConfigured()) return { ok: false, reason: 'not_configured', vectors: [] };

  const estimatedCostUsd = estimateEmbeddingCostUsd(inputs);
  const reservation = await reserveExternalAiSpend({
    db,
    user,
    request,
    feature,
    estimatedCostUsd,
    metadata: { ...metadata, model: EMBEDDING_MODEL, inputs: inputs.length },
  });

  if (!reservation.allowed) return { ok: false, reason: reservation.reason, gate: reservation, vectors: [] };

  try {
    const { vectors, usage } = await callEmbeddingProvider(inputs);
    // Charge for what the provider actually counted when it reports it; the
    // gate caps settlement at the approved amount either way.
    const actualCostUsd = usage?.total_tokens
      ? (usage.total_tokens / 1000) * 0.00002
      : estimatedCostUsd;

    await settleExternalAiSpend({
      db,
      reservation,
      actualCostUsd,
      feature,
      userId: user?.id || null,
      provider: 'openai',
      model: EMBEDDING_MODEL,
      metadata: { ...metadata, inputs: inputs.length, version: EMBEDDING_VERSION },
    });

    return { ok: true, vectors, costUsd: actualCostUsd };
  } catch (error) {
    await releaseExternalAiSpend({ db, reservation, reason: 'embedding_failed' });
    return { ok: false, reason: 'provider_error', error: error.message, vectors: [] };
  }
}

/** Embeds one search query. Separate feature id so query spend is visible apart from indexing. */
export async function embedQuery({ db, user, request = null, query }) {
  const text = String(query || '').trim();
  if (!text) return { ok: false, reason: 'empty_query', vector: null };

  const result = await embedTexts({
    db,
    user,
    request,
    texts: [text],
    feature: 'smart_search_query',
    metadata: { kind: 'query' },
  });

  if (!result.ok || !result.vectors.length) return { ok: false, reason: result.reason, gate: result.gate, vector: null };
  return { ok: true, vector: result.vectors[0], costUsd: result.costUsd };
}
