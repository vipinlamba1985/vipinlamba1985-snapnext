# SnapNext Magic Library Intelligence v1.2.1 — implementation decision

This note resolves the intentional constraints around the first production-safe Magic Sorter / People face gate.

## D3 — automatic People face gate

For the initial rollout the automatic gate is:

- `0 faces` → terminal `no_faces`; never call Rekognition.
- `1–4 faces` → eligible for the existing People Rekognition pipeline when versioned face-processing consent is present.
- `5+ faces` → terminal local `group_photo`; no automatic Rekognition identity processing.
- Missing or stale local analysis → `awaiting_analysis`, never `no_faces`.
- Missing consent → `awaiting_consent`.

The 5+ boundary is intentional for v1.2.1. It preserves the existing `MAX_FAMILY_SIZED_FACE_COUNT = 4` quality boundary and is also a cost guard for the current implementation. Rekognition Collections remove the multiplier based on the number of activated People, but the current SnapNext code still performs one `IndexFaces` operation per eligible photo and then per-usable-face `SearchUsers` and `AssociateFaces` work. Therefore the present implementation is not truly flat-cost per photo. `MAX_INDEXED_FACES_PER_PHOTO` remains a second defensive cap, not a replacement for this boundary in this release.

A future explicit "Find people in this group photo" action may process larger groups under a separately bounded user action.

## Defensive AWS under-count cleanup

If trusted local analysis reports 1–4 faces but `IndexFaces` returns more than the family-sized boundary, SnapNext deletes only the FaceIds returned by that just-completed `IndexFaces` call, before any `SearchUsers`, `CreateUser`, or `AssociateFaces` operation runs. This prevents new crowd vectors from being retained or attached to identities. It does **not** refund or erase the already-incurred `IndexFaces` processing cost.

## Web producer: upload first, backlog second

The normal web upload path is the primary producer of `magic-sorter-v1` face-count analysis:

1. local face counting starts only after the user presses the single Back Up confirmation;
2. it runs in parallel with the media transfer and never delays successful backup completion;
3. once the media commit returns its id, the local result is persisted to `media_analysis`;
4. no Rekognition call is made from the upload client;
5. a local-analysis failure never turns a successful backup into a failed backup.

This means an active user's new uploads do not depend on opening Magic Library later just to acquire `faceCount`.

## Deferred-analysis backlog

`awaiting_analysis` is recoverable state, not a terminal classification. The Web backlog exists only as catch-up/recovery for older media and upload-time analysis that was interrupted:

1. authenticated API returns a bounded page of owned photos whose `magicAnalysisVersion` is stale/missing;
2. a stable cursor advances the visit beyond the current page;
3. browser performs local face detection;
4. result is written to `media_analysis` and a previously deferred People item returns to `queued`;
5. failures receive bounded exponential retry backoff so one corrupt/unsupported early item cannot starve later media;
6. the client performs a bounded number of attempts per Magic visit.

The backlog must not become the permanent producer for all future uploads. Native producers can write the same shared analysis contract when available.

## Rollout is fail-closed

`MAGIC_SORTER_ENABLED`, `FACE_PROCESSING_ENABLED`, and `LOCAL_FACE_GATE_ENABLED` default **off**. A merge with no explicit rollout configuration must not start local face analysis, People migration, or paid face processing. The server reindex endpoint also checks rollout and consent before starting work; client hiding alone is not a safety boundary.

## Consent revoke and deletion debt

Grant is explicit and versioned. Revoke immediately makes the consent invalid for future People gate checks and creates/renews a durable `face_deletion_requests` state with `status: pending` and a monotonically increasing generation.

Revoke does **not** claim existing AWS face vectors are already deleted. The UI must say deletion is pending until M7 removes all relevant remote/local identity data and independently verifies completion. Re-grant is blocked while deletion is pending/processing.

**Verified deletion remains a launch blocker.** The queue created in this milestone is the input to M7; it is not a substitute for the M7 deletion worker and verification pass.

## Runtime self-hosting

The browser worker may not load the MediaPipe JavaScript runtime, WASM, or face model from a third-party origin. Build-time staging pins them into a versioned same-origin path under `/vendor/mediapipe/tasks-vision/<version>/`, with a SHA-256 asset manifest. A model/runtime upgrade changes the versioned path rather than relying on stale cache replacement.

Build-time staging currently downloads pinned upstream artifacts. Runtime self-hosting therefore does not imply a fully offline or independently mirrored build supply chain.

## M2 cost measurement rule

The existing `$0.005` ceiling is a guard, not a measured baseline. M2 starts by instrumenting the actual People reasoning/provider cost path into the ledger, then uses that observed data for before/after optimization. Until instrumentation lands, cloud billing data can be used only as a coarse external reference.

Do not block M2 optimization on pretending the current ceiling is a complete baseline, and do not present a partially instrumented ledger as measured unit cost.

## Merge rule

The face-gate branch must not merge merely because the server gate exists. The same change must include:

- a functioning Web local-analysis producer wired to normal upload;
- bounded cursor/backoff catch-up for historical/interrupted media;
- fail-closed rollout flags and server checks;
- explicit consent with honest pending-deletion state;
- same-origin versioned runtime/WASM/model assets.

Even after those conditions pass, production activation remains blocked on verified deletion (M7) and the normal release validation/device checks. Merging code dormant is different from enabling People processing.
