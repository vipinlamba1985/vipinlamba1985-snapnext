# Create / Reel C1 — Async Canonical Render Pipeline

**Status:** backend execution layer on top of C0. This sprint does not enable the Create UI by itself.

C1 turns the C0 render artifact lifecycle into an asynchronous worker protocol without moving quota, margin, source-integrity, publication, or deletion authority out of SnapNext.

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
- controlled multipart upload part size: 10 MB

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

The initial dispatch deliberately does **not** give the worker a final-object PUT URL. A long-lived presigned PUT would remain usable after the user deleted source media, creating a future-write race against verified deletion.

## 4. Deletion-safe output publication

The worker renders into its local/ephemeral workspace first. When encoding is complete and the final byte size is known, it calls the authenticated SnapNext callback with:

`status: upload_plan`

SnapNext then:

1. verifies the artifact is still rendering
2. verifies the original media-deletion generation is still current
3. re-verifies every source media id and content hash
4. validates the output byte size against the 250 MB cap
5. creates a multipart upload for the exact canonical key
6. stores the multipart upload id against the active artifact
7. rechecks the source/deletion window after creation
8. returns short-lived signed URLs for the required 10 MB parts

The canonical key remains:

`renders/<hashed-owner>/<manifest-hash>.mp4`

The worker may upload parts, but it is never authorized to call `CompleteMultipartUpload`. Only SnapNext can complete the multipart session after the worker reports the final probe and part ETags.

This matters for deletion. S3 multipart parts do not become the final object until completion. SnapNext verified deletion now lists and aborts every pending multipart upload for the exact storage key **before** deleting and verifying the object. Therefore an already-issued part URL cannot later be completed into a deleted Reel.

## 5. Soundtrack pinning

The current CC0 soundtrack includes its source checksum in the SnapNext catalog. Export requires all three to match the catalog:

- track id
- content hash
- frozen license snapshot

The worker receives the original OGG source whose checksum is pinned by the catalog, rather than a different transcode with a different byte hash. A free/commercial-use label alone is not enough.

## 6. Dispatch and idempotency

The worker request carries:

- `jobId`
- `artifactId`
- `manifestHash`
- canonical manifest
- signed private source reads
- soundtrack source when present
- canonical output specification
- configured callback URL

`jobId` is also sent as the HTTP idempotency key.

A network timeout or ambiguous 5xx/429 response moves the SnapNext job to `dispatch_unknown` instead of creating a second artifact or consuming another quota reservation. Re-submitting the same manifest reuses the same active artifact/job and can safely redispatch the same idempotency key.

Permanent worker rejections fail the C0 artifact and release its reservations.

The callback URL is not derived from the incoming user's Host/request URL. It is a fixed HTTPS endpoint configured by `CREATE_RENDER_CALLBACK_URL`, preventing request-host manipulation from redirecting trusted-worker callbacks.

## 7. Worker callback

`POST /api/internal/create-render/callback`

The callback requires a dedicated long bearer secret configured independently on SnapNext and the trusted worker.

Supported callbacks:

- `progress`
- `rendering`
- `upload_plan`
- `failed`
- `completed`

For `completed`, SnapNext performs these gates before publication:

1. validate worker probe against canonical H.264/AAC MP4 contract
2. validate actual cost and planned output byte size
3. recheck source hashes and media-deletion generation before multipart completion
4. complete the multipart upload server-side using the worker's ETags
5. verify exact output byte size in SnapNext S3
6. verify S3 content type is `video/mp4`
7. move artifact to `pending_validation`
8. run the C0 final source-hash and deletion-generation validation
9. conditionally publish `ready`
10. recheck deletion generation after publication
11. settle render quota and actual company render cost
12. mark the job `ready`

If SnapNext crashes after S3 multipart completion but before database finalization, a repeated `completed` callback first detects and verifies the already-created object, then resumes the same finalization path instead of attempting a second upload.

Late callbacks cannot revive a `ready`, `failed`, `stale_source`, or `deletion_failed` artifact. Terminal stale attempts trigger another strict cleanup pass so a late worker cannot reintroduce controlled output.

## 8. Polling and download

`GET /api/create/reels/render/:jobId`

The user can poll a safe job/artifact projection. Storage keys, multipart ids, part URLs, and renderer credentials are never returned through the user polling API. A ready artifact receives a short-lived signed MP4 download URL and the frozen external-copy deletion notice.

## 9. Cost assumptions

The launch cost reservation is deliberately conservative and configurable:

- `CREATE_RENDER_BASE_COST_USD` — default 0.01
- `CREATE_RENDER_COST_PER_MINUTE_USD` — default 0.12
- `CREATE_RENDER_COST_PER_SCENE_USD` — default 0.0015

These values are internal reserve assumptions, not user prices. C0 records the trusted worker's actual render cost at settlement.

## 10. Required production configuration

C1 dispatch remains fail-closed until all are present:

- `CREATE_RENDER_PROVIDER_URL` — HTTPS worker job endpoint
- `CREATE_RENDER_CALLBACK_URL` — HTTPS SnapNext callback endpoint
- `CREATE_RENDER_PROVIDER_KEY` (16+ chars)
- `CREATE_RENDER_CALLBACK_SECRET` (32+ chars)
- AWS S3 credentials/region/bucket
- `STORAGE_PROVIDER=s3`

The external renderer must implement the `snapnext-canonical-reel-v1` contract and must be configured with the callback secret separately. The callback secret is not included in the dispatch payload.

For production the callback should be configured to the canonical SnapNext endpoint, for example the production origin plus `/api/internal/create-render/callback`; previews should use an explicitly configured preview callback rather than an inbound request-derived URL.

## 11. What C1 does not claim

C1 implements the SnapNext-side async execution protocol, controlled multipart publication, validation, polling, storage handoff, idempotency, deletion-race protection, and C0 settlement wiring.

It does **not** claim that a production FFmpeg/Remotion worker has been deployed, that the Create editor is calling these APIs, or that physical iPhone/Android export/share QA has passed. Those remain explicit gates before the feature can be presented as shipped to end users.
