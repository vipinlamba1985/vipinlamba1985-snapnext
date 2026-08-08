Magic Library uses SnapNext's existing MongoDB-backed People identities and media metadata. Current People activation remains server-enforced by plan entitlements; this implementation does not create a parallel identity store.

People recognition now has a local-cost/privacy gate documented in `docs/MAGIC_LIBRARY_INTELLIGENCE_V1_2_1.md`: missing local analysis stays `awaiting_analysis`, zero-face photos never reach Rekognition, 1–4 face photos can enter the existing People pipeline only with recorded consent, and 5+ face photos remain local Group Photos for the initial rollout.

The Web producer and bounded backlog sweep ship with the gate so deferred photos can recover instead of becoming a permanent gap. Android and iOS producers will write the same `magic-sorter-v1` analysis contract.