# SnapNext Magic Library Intelligence v1.2.1 — implementation decision

This note resolves the only intentional divergence between Blueprint v1.2 and the first production-safe M0/M1 implementation.

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

## Deferred-analysis backlog

`awaiting_analysis` is recoverable state, not a terminal classification. The Web producer includes a bounded backlog sweep in Magic Library:

1. authenticated API returns at most six owned photos whose `magicAnalysisVersion` is stale/missing;
2. browser performs local face detection;
3. result is written to `media_analysis`;
4. a previously deferred People item returns to `queued` for policy evaluation;
5. unsupported/failed files remain deferred and are never silently converted to `no_faces`.

The sweep is deliberately bounded to control bandwidth and browser work. Native producers can write the same shared analysis contract when available.

## Merge rule

The face-gate branch must not merge merely because the server gate exists. A functioning Web local-analysis producer and the bounded backlog path must ship in the same change so the gate does not create an unrecoverable People gap for web users.
