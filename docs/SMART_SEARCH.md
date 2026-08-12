# Smart search

Semantic search over the library: typing "beach" finds a photo described as
"seaside", because search compares *meaning* rather than spelling.

## Why it is cheap

The expensive step has already been paid for. Enrichment already ran a vision
model over each photo and stored what it saw in `aiAnalysis` and
`asset_intelligence`. Smart search embeds **that existing text**. It never sends
an image anywhere.

- Model: `text-embedding-3-small` at 256 dimensions (~1KB per photo)
- Price assumption in the existing spend estimator: $0.02 per 1M tokens
- **10,000 photos ≈ $0.01, one time.** A search ≈ a fraction of a cent

`tests/smart-search.test.mjs` asserts the 10,000-photo estimate stays under
$0.05, so a change to the embedded text cannot quietly make indexing expensive.

## Switching semantic search on

1. Set `OPENAI_API_KEY`.
2. Optionally set `SMART_SEARCH_ENABLED=false` to force semantic search off with
   the key present.
3. Index the library in batches: `POST /api/ai-index/embeddings` with
   `{ "batchSize": 25 }`, repeatedly, until the response reports `done: true`.
   `GET` the same route for progress.

Nothing happens automatically. There is no background job that indexes a library
unattended — each batch is an explicit, individually metered call, in the same
spirit as `PEOPLE_COST_POLICY`.

## How a search runs

1. The query is embedded (one small metered call).
2. **Keyword leg** — the database finds candidates across the whole library and
   whole-word matching decides what counts.
3. **Semantic leg** — the query vector is compared against stored vectors.
4. The two rankings are fused with Reciprocal Rank Fusion, weighted slightly
   toward keyword (1.2 vs 1.0).

Fusion compares *positions*, not scores, so the two legs never need a shared
scale. Each covers the other's weakness: vector search is poor at exact tokens
(names, `IMG_4021`, dates), keyword search is blind to meaning.

Every result carries `matchedBy`: `keyword`, `meaning`, or `both`.

## Atlas Vector Search scalability path

The preferred production semantic leg uses MongoDB Atlas Vector Search on the
existing `media_embeddings` collection. It does **not** change embedding
providers, generate new vectors, or add AI spend. Atlas only replaces the
application-side nearest-neighbour scan.

The checked-in index definition is:

`docs/atlas/smart-search-vector-index.json`

Create a Vector Search index on `media_embeddings` using that definition and an
index name such as `snapnext_smart_search_v1`. The definition is intentionally
small:

- `vector`: 256 dimensions, cosine similarity
- `userId`: filter field
- `version`: filter field

Do not add unrelated fields to this index. `userId` and `version` are indexed as
filter fields because both are applied **inside** `$vectorSearch`, before nearest
neighbours are selected. Post-filtering would spend the result budget on another
tenant or an obsolete embedding version and then throw those rows away.

MongoDB's ANN guidance recommends starting with `numCandidates` at least 20× the
number of returned documents. SnapNext follows that starting point while keeping
both result and candidate counts bounded.

### Production activation

1. Create the Atlas Vector Search index from
   `docs/atlas/smart-search-vector-index.json` on `media_embeddings`.
2. Wait until Atlas reports the index ready/queryable.
3. Set `SMART_SEARCH_ATLAS_VECTOR_INDEX` to the **exact index name**.
4. Redeploy.
5. Run signed-in meaning-search QA and compare representative queries with the
   previous path before treating the index as the production baseline.

Do **not** set `SMART_SEARCH_ATLAS_VECTOR_INDEX` before the index is ready just to
make the code path look enabled. The app will fail soft, but the configuration
would be misleading.

### Query behavior

With the environment variable configured, `$vectorSearch` is the **first**
aggregation stage. It pre-filters by the authenticated `userId` and
`EMBEDDING_VERSION`, returns only a bounded candidate set, and projects the
candidate vectors. SnapNext then runs its existing exact cosine threshold over
that small set before RRF. This preserves the relevance behavior that previously
ran across the full in-memory scan while eliminating the 25k application scan in
the normal Atlas path.

No dedicated Search Nodes, automatic embedding, native reranking, or extra
provider is required for this first rollout. Those are later scale decisions,
not launch prerequisites.

## Compatibility fallback

`SEMANTIC_SCAN_CAP` remains 25,000 as a deliberate fallback only.

SnapNext uses the existing bounded application scan when:

- `SMART_SEARCH_ATLAS_VECTOR_INDEX` is unset,
- a local/self-hosted MongoDB deployment has no compatible vector index, or
- Atlas rejects the vector query because the index is missing, building, or
  temporarily unavailable.

Therefore this PR does not make Atlas Vector Search a new availability dependency.
Keyword search continues to cover the entire library either way. On the Atlas
path, semantic matching is no longer limited to the most recently indexed 25k
vectors.

## It never breaks search

Smart search is strictly additive:

- No `OPENAI_API_KEY` → keyword search, exactly as before
- Spend gate declines → keyword search, and the response says why in `smart.reason`
- Provider errors → reservation released, keyword results still returned
- Library only partly embedded → indexed photos gain semantic matching, the rest
  keep keyword matching
- Atlas index unavailable → bounded legacy semantic scan

A user never loses search because of a budget or vector-index outage.
`?smart=false` opts out per request.

## Billing

Declared in `lib/creative-credits.js` as two metered features:
`smart_search_index` and `smart_search_query`. Both reserve through
`lib/ai-spend-gate.js` before the provider call and settle or release after —
a failed call gives the money back. Query spend is a separate feature id from
indexing spend so the two are visible apart.

Photos with nothing described are skipped for free: embedding them would buy a
vector of a filename.

Atlas Vector Search itself does not create an additional AI-credit charge in
SnapNext. It is database retrieval infrastructure over vectors that already
exist.

## Spend safety

Every guard below has regression coverage in the Smart Search test suites.

- **Ordinary search is free.** `/api/media` — what the Library search box uses —
  cannot reach the embedding provider at all.
- **Meaning search is opt-in.** The endpoint spends only on an explicit
  `?smart=true`. Anything else runs on keywords.
- **It takes a deliberate tap.** The Library offers "Search by meaning" only
  after a free search returned fewer than five results, and only a click runs
  it. Nothing spends from an effect, a timer or a keystroke.
- **A phrase is paid for once, ever.** Query embeddings are cached by hash and
  shared across users, so "beach" is embedded once for the whole product. Only
  the hash is stored — what any individual searched for is not recoverable.
- **Indexing is bounded.** Batches are capped and caller-driven; nothing
  schedules itself.
- **Failures refund.** A provider error releases the reservation.
- **Vector retrieval is tenant-scoped before nearest-neighbour selection.** The
  Atlas stage filters `userId` and `version` internally.

## Re-indexing

`EMBEDDING_VERSION` (`smart-search-v1`) is stored on every vector. Changing the
model, dimensions, or text that gets embedded means bumping it; searches ignore
vectors from other versions, and the indexing endpoint treats them as
un-indexed. Mismatched widths compare as zero similarity rather than producing a
confident wrong answer.

If the dimensions or vector field change, update the Atlas Vector Search index
definition and wait for the replacement index to become queryable before
switching the configured index name.
