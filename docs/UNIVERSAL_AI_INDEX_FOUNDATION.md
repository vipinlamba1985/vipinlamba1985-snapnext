# SnapNext Universal AI Index — Foundation

Status: **controlled rollout foundation**  
Pipeline version: `universal-index-v1`

## Goal

Turn each saved SnapNext asset into private, structured intelligence that can support premium search, grounded AI answers, task suggestions, document understanding, and future personalization.

This foundation intentionally does **not** train a foundation model, perform destructive actions, publish content, share files, or identify people globally.

## What is implemented

### 1. Universal Asset Intelligence

`lib/asset-intelligence.js` creates a structured record for photos, videos, saved text, screenshots, scanned documents, receipts, email screenshots, chats, and social content.

The record can contain:

- summary and description
- OCR / visible text
- content and document type
- topics
- private people labels already present in the user's media metadata
- organizations and places
- objects and activities
- video chapters and highlight suggestions
- important dates
- suggested actions
- suggested tasks
- natural-language search phrases
- importance and confidence scores

Every suggested task or action is marked `approvalRequired: true`.

### 2. Reuse Existing Analysis Before Spending Again

`lib/asset-intelligence-cached.js` checks whether the current media record already contains usable, verified analysis from the existing upload pipeline.

When usable analysis exists:

1. SnapNext reuses it.
2. It does not re-run vision on the same asset.
3. The reasoning layer builds search and action intelligence from the verified evidence.

When usable analysis does not exist, the existing image/video analysis path is used.

### 3. Durable, Reversible Queue

`lib/universal-ai-index.js` provides:

- idempotent enqueue checks
- durable `analysis_jobs`
- bounded worker execution
- retry with backoff
- large-asset deferral
- isolated `asset_intelligence` storage
- status summaries
- complete per-user AI index reset

The new intelligence index does **not** overwrite the existing `media.aiAnalysis` record. This keeps the rollout reversible and protects current Gallery and Magic Library behavior.

### 4. Rich Grounded Retrieval

`lib/ai-memory-retrieval.js` reads both:

- existing media metadata
- new Universal AI Index records

The SnapNext agent can now retrieve richer evidence including OCR text, document types, organizations, dates, suggested tasks, suggested actions, objects, activities, and search phrases.

The agent prompt explicitly forbids inventing people, relationships, places, dates, deadlines, events, tasks, or counts.

### 5. Private Learning Feedback

`POST /api/ai-index/feedback` stores bounded correction and preference events such as:

- search result opened / ignored
- person or place corrected
- task accepted / rejected
- caption accepted / edited
- asset favorited / hidden
- agent answer helpful / wrong

Current consent level is fixed to:

`personal_learning_only`

These events are not a public training dataset and are not automatically used to retrain an external or SnapNext model.

## Collections

### `analysis_jobs`

Durable queue state for one asset and one pipeline version.

Important states:

- `queued`
- `processing`
- `completed`
- `retry_scheduled` through a queued job with `nextAttemptAt`
- `failed`
- `deferred`
- `cancelled`

### `asset_intelligence`

One current intelligence record per:

`userId + mediaId + pipelineVersion`

### `ai_feedback_events`

Private, account-scoped learning signals.

## API surface

### Enqueue owned assets

`POST /api/ai-index/enqueue`

Input:

```json
{
  "mediaIds": ["media-id-1", "media-id-2"]
}
```

Rules:

- authenticated user only
- media ownership enforced
- trashed media excluded
- maximum 50 IDs per request
- controlled rollout gate enforced

### Process queued work

`POST /api/ai-index/process`

Input:

```json
{
  "limit": 1
}
```

Rules:

- authenticated owner can process only that owner's jobs
- server worker can use `x-ai-worker-secret`
- maximum five jobs per API call
- cross-user processing is available only to the server-side worker credential

### Read status

`GET /api/ai-index/status`

Optional:

`?mediaId=<owned-media-id>`

### Search intelligence

`GET /api/ai-index/search?q=<natural-language-query>`

The first foundation uses structured metadata ranking. True multimodal vector embeddings are a later phase and should not be claimed as complete yet.

### Record private feedback

`POST /api/ai-index/feedback`

### Reset AI intelligence data

`DELETE /api/ai-index/reset`

Required body:

```json
{
  "confirm": "DELETE_AI_INDEX"
}
```

This removes the user's queue records, intelligence records, and AI feedback events. It does not delete original photos, videos, saved text, or current legacy media analysis.

## Rollout controls

Environment variables:

```text
AI_INDEX_ENABLED=false
AI_WORKER_SECRET=
AI_IMAGE_ANALYSIS_MAX_BYTES=26214400
AI_VIDEO_ANALYSIS_MAX_BYTES=15728640
```

Default behavior:

- normal users: blocked while `AI_INDEX_ENABLED=false`
- Super User: controlled testing allowed
- server worker: allowed only with the correct secret

Do not set `AI_INDEX_ENABLED=true` until the QA checklist passes.

## Safety rules

1. Original media is never deleted by the AI Index.
2. New intelligence is stored separately from existing media metadata.
3. A user can only enqueue, search, inspect, or give feedback on their own data.
4. Tasks and actions remain suggestions; execution requires approval.
5. Large assets are deferred instead of loading unbounded media into memory.
6. Failed jobs retry with bounded backoff and then stop.
7. Private feedback remains account-scoped.
8. No user content becomes training data by default.
9. No automatic sharing, publishing, sending, or destructive cleanup is included in this foundation.

## Before normal-user enablement

The following must be completed:

1. Run the full QA checklist on Super User data.
2. Add `resetAiIndexForUser` to the existing full account-deletion workflow so account deletion removes all new AI collections automatically.
3. Confirm deployment secrets and worker authentication.
4. Add worker telemetry for queue age, failures, retries, deferrals, provider path, latency, and cost.
5. Verify provider retention configuration and production privacy terms.
6. Add a user-facing AI processing / privacy control before broad rollout.

## Next engineering phases

### Phase 1.1 — Worker operations

- scheduled bounded worker execution
- queue age alerts
- retry / failure dashboard
- provider and cost telemetry

### Phase 1.2 — Document intelligence

- page-level PDF and scan records
- OCR confidence
- document relationships
- expiry and deadline review

### Phase 1.3 — Video intelligence

- streaming / uploaded-file analysis for videos above the inline limit
- scene timeline records
- timestamp-level retrieval
- audio transcript segments

### Phase 1.4 — Multimodal search

- embeddings for text, image, video, and documents
- semantic + keyword hybrid ranking
- evidence-based reranking

### Phase 1.5 — Personal learning

- correction application to the user's private memory
- personal ranking preferences
- evaluation datasets built only from properly permitted data
- model training only after licensing, consent, deletion, and quality controls are complete
