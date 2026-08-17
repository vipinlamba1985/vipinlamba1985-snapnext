# Create / Reel C1 — Async Canonical Render Pipeline

**Status:** backend execution layer on top of C0. This sprint does not enable the Create UI by itself.

C1 turns the C0 render artifact lifecycle into an asynchronous worker protocol without moving quota, margin, source-integrity, or deletion authority out of SnapNext.

## 1. Launch envelope

Canonical Reel export is intentionally bounded while renderer economics and device compatibility are measured:

- maximum duration: 60 seconds
- maximum scenes: 20
- output: MP4
- video: H.264, High profile, yuv420p, 30 fps
- audio when soundtrack is present: AAC, 44.1 kHz, 128 kbps
- fast-start MP4 required
- 9:16 output: 1080 × 1920
- maximum stored output: 250 MB

Other supported Create aspect ratios have fixed 1080-class output dimensions. The worker must return probe metadata and SnapNext rejects output that does not satisfy the contract.

## 2. Render request flow

`POST /api/create/reels/render`

1. authenticates the SnapNext user
2. canonicalizes and validates the manifest
3. applies the C1 launch envelope
4. calculates a positive conservative internal render-cost estimate
5. calls C0 `prepareCanonicalRender`
6. returns a verified cache hit immediately when available
7. otherwise creates/reuses one idempotent `render_jobs` record per active artifact
8. dispatches the job to the configured trusted render worker

C0 remains authoritative for monthly render quota, shared company margin reservation, source hashes, media-deletion generation, artifact identity, and final publication.

If the renderer is not configured, a newly prepared artifact is failed and its reservations are released. The response explicitly states that no export allowance was used.

## 3. Private source delivery

The worker never receives AWS credentials and never receives raw user account metadata.

Each referenced source is supplied as a short-lived signed read URL. The worker receives only:

- media id
- media kind
- MIME type
- byte size
- expected content hash
- signed read URL

The output is written through a short-lived presigned S3 PUT URL whose key must match the C0 canonical render-key pattern:

`renders/<hashed-owner>/<manifest-hash>.mp4`

The PUT is fixed to `video/mp4`.

## 4. Soundtrack pinning

The current CC0 soundtrack now includes its source checksum in the SnapNext catalog. Export requires all three to match the catalog:

- track id
- content hash
- frozen license snapshot

A free/commercial-use label alone is not enough.

## 5. Dispatch and idempotency

The worker request carries:

- `jobId`
- `artifactId`
- `manifestHash`
- canonical manifest
- signed sources
- soundtrack source when present
- presigned output target
- callback URL

`jobId` is also sent as the HTTP idempotency key.

A network timeout or ambiguous 5xx/429 response moves the SnapNext job to `dispatch_unknown` instead of creating a second artifact or consuming another quota reservation. Re-submitting the same manifest reuses the same active artifact/job and can safely redispatch the same idempotency key.

Permanent worker rejections fail the C0 artifact and release its reservations.

## 6. Worker callback

`POST /api/internal/create-render/callback`

The callback requires a dedicated long bearer secret configured independently on SnapNext and the trusted worker.

Supported callbacks:

- `progress`
- `rendering`
- `failed`
- `completed`

For `completed`, SnapNext performs these gates before publication:

1. validate worker probe against canonical H.264/AAC MP4 contract
2. verify output byte size in SnapNext S3
3. verify S3 content type is `video/mp4`
4. move artifact to `pending_validation`
5. run C0 final source-hash and deletion-generation validation
6. conditionally publish `ready`
7. recheck deletion generation after publication
8. settle render quota and actual company render cost
9. mark the job `ready`

A repeated completed callback for an already-ready artifact is idempotent.

## 7. Polling and download

`GET /api/create/reels/render/:jobId`

The user can poll a safe job/artifact projection. Storage keys and renderer credentials are never returned. A ready artifact receives a short-lived signed MP4 download URL and the frozen external-copy deletion notice.

## 8. Cost assumptions

The launch cost reservation is deliberately conservative and configurable:

- `CREATE_RENDER_BASE_COST_USD` — default 0.01
- `CREATE_RENDER_COST_PER_MINUTE_USD` — default 0.12
- `CREATE_RENDER_COST_PER_SCENE_USD` — default 0.0015

These values are internal reserve assumptions, not user prices. C0 records the trusted worker's actual render cost at settlement.

## 9. Required production configuration

C1 dispatch remains fail-closed until all are present:

- `CREATE_RENDER_PROVIDER_URL`
- `CREATE_RENDER_PROVIDER_KEY` (16+ chars)
- `CREATE_RENDER_CALLBACK_SECRET` (32+ chars)
- AWS S3 credentials/region/bucket
- `STORAGE_PROVIDER=s3`

The external renderer must implement the `snapnext-canonical-reel-v1` contract and must be configured with the callback secret separately. The callback secret is not included in the dispatch payload.

## 10. What C1 does not claim

C1 implements the SnapNext-side async execution protocol, validation, polling, storage handoff, idempotency, and C0 settlement wiring.

It does **not** claim that a production FFmpeg/Remotion worker has been deployed, that the Create editor is calling these APIs, or that physical iPhone/Android export/share QA has passed. Those remain explicit gates before the feature can be presented as shipped to end users.
