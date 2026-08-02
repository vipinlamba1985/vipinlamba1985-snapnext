# Smart search

Semantic search over the library: typing "beach" finds a photo described as
"seaside", because search compares *meaning* rather than spelling.

## Why it is cheap

The expensive step has already been paid for. Enrichment already ran a vision
model over each photo and stored what it saw in `aiAnalysis` and
`asset_intelligence`. Smart search embeds **that existing text**. It never sends
an image anywhere.

- Model: `text-embedding-3-small` at 256 dimensions (~1KB per photo)
- Price: $0.02 per 1M tokens
- **10,000 photos ≈ $0.01, one time.** A search ≈ a fraction of a cent

`tests/smart-search.test.mjs` asserts the 10,000-photo estimate stays under
$0.05, so a change to the embedded text cannot quietly make indexing expensive.

## Switching it on

1. Set `OPENAI_API_KEY`.
2. Optionally set `SMART_SEARCH_ENABLED=false` to force it off with the key present.
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

## It never breaks search

Smart search is strictly additive:

- No `OPENAI_API_KEY` → keyword search, exactly as before
- Spend gate declines → keyword search, and the response says why in `smart.reason`
- Provider errors → reservation released, keyword results still returned
- Library only partly indexed → indexed photos gain semantic matching, the rest
  keep keyword matching

A user never loses search because of a budget. `?smart=false` opts out per request.

## Billing

Declared in `lib/creative-credits.js` as two metered features:
`smart_search_index` and `smart_search_query`. Both reserve through
`lib/ai-spend-gate.js` before the provider call and settle or release after —
a failed call gives the money back. Query spend is a separate feature id from
indexing spend so the two are visible apart.

Photos with nothing described are skipped for free: embedding them would buy a
vector of a filename.

## Known limit: the scan cap

Similarity is computed **in the application**, not by a database vector index.
`SEMANTIC_SCAN_CAP` (25,000) bounds how many stored vectors one search compares.

Beyond that, semantic matching covers only the most recently indexed photos.
**Keyword search still covers the entire library**, so nothing becomes
unfindable — but the semantic half stops being complete.

Removing the cap means moving to a database vector index:

- **MongoDB Atlas** — create an Atlas Vector Search index on
  `media_embeddings.vector` (256 dimensions, cosine) and replace
  `semanticRanking` with a `$vectorSearch` stage. Filter by `userId` **inside**
  the stage, never afterwards: post-filtering culls the nearest neighbours after
  they are chosen and collapses recall, and the in-stage filter is also the
  tenant-isolation guarantee.
- **Self-hosted MongoDB** — there is no vector operator. Either keep the scan
  cap or move vectors to a dedicated store.

This was left as a documented limit rather than built, because which database
you run is a deployment fact I could not verify from the repository.

## Spend safety

Every guard below has a test in `tests/smart-search-spend-safety.test.mjs`.

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

## Re-indexing

`EMBEDDING_VERSION` (`smart-search-v1`) is stored on every vector. Changing the
model, the dimensions, or the text that gets embedded means bumping it; searches
ignore vectors from other versions, and the indexing endpoint treats them as
un-indexed. Mismatched widths compare as zero similarity rather than producing a
confident wrong answer.
