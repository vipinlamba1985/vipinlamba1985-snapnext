Magic Library uses SnapNext's existing MongoDB-backed People identities and media metadata. Current People activation remains server-enforced by plan entitlements; this implementation does not create a parallel identity store.

People recognition has a local cost/privacy gate documented in `docs/MAGIC_LIBRARY_INTELLIGENCE_V1_2_1.md`: missing local analysis stays `awaiting_analysis`, zero-face photos never reach Rekognition, 1–4 face photos can enter the existing People pipeline only with recorded consent, and 5+ face photos remain local Group Photos for the initial rollout.

The normal Web upload path is the primary `magic-sorter-v1` producer. Local face counting starts only after Back Up is confirmed, overlaps the upload, and never holds backup completion open. The bounded cursor/backoff Magic Library sweep is catch-up for historical or interrupted items rather than the permanent producer for every future upload. Android and iOS producers will write the same shared analysis contract.

The browser runtime, WASM, and face model are served from a versioned same-origin static path. Rollout flags default off, and server processing endpoints enforce rollout plus consent before People migration starts.

Consent revoke stops future eligible processing and records pending deletion work. It does not claim existing vectors are already gone. Verified face-data deletion and verification remain an M7 launch blocker before People processing is enabled in production.

M2 begins with real ledger instrumentation of the People provider/reasoning path. The existing configured cost ceiling remains a guardrail, not a measured baseline.
