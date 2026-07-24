# SnapNext Pro Experiment — Production Adoption Decisions

This document records which ideas from the experimental `vipinlamba1985-snapnext-pro` repository are suitable for the main SnapNext product.

The Pro repository remains an experiment. Nothing is inherited automatically.

## Adopt now

### Stronger engineering discipline

Adopt consistent pull-request test/build checks, clear contribution rules and explicit architecture ownership.

Reason: these improve reliability without changing the user experience or introducing operational complexity.

### Domain-oriented modularity

Use clear ownership for authentication, media/storage, Smart Sync, People/sharing, memories/AI, billing/entitlements and native behavior.

Reason: the production app has grown large enough that clearer boundaries will reduce accidental coupling. This should be done incrementally, not through a rewrite.

### Provider abstractions

Continue placing S3/storage, AI models and cloud-source implementations behind adapters/interfaces.

Reason: SnapNext should be able to evolve providers without rebuilding the product surface.

### Testing culture

Require automated regression coverage for meaningful upload, security, sharing, billing, entitlement and synchronization changes.

Reason: these paths carry the highest user-trust and financial risk.

### Background-worker direction

Keep worker/queue separation as an approved future pattern for genuinely long-running jobs such as cloud sync, AI media processing, export and video generation.

Reason: independent workers can improve durability and scaling when load justifies them.

## Adopt later when justified

### Shared packages

A shared core/API-client/UI package structure becomes useful if web and native applications begin sharing substantial TypeScript code.

Do not create packages only to imitate the experimental monorepo.

### Dedicated worker deployment

Introduce only after a measured requirement for queue durability or independent scaling.

### Turborepo/monorepo tooling

Consider only when SnapNext has multiple real deployable applications/services and shared packages. The current production repository benefits from being simpler.

### Storybook/design-system package

Useful once reusable production components are sufficiently stable and numerous. It is not required to deliver the current product roadmap.

## Do not adopt from the current Pro implementation

### Custom JWT/password auth

The Pro API uses a separate JWT/password authentication path. Production SnapNext should keep Supabase as the primary identity path and its current fail-closed migration behavior.

### Fallback JWT secrets

Never copy any code that supplies a default signing secret when production configuration is missing.

### JavaScript-readable session cookies

Do not copy the Pro frontend session pattern that writes the access token through client-side cookie APIs.

### Global duplicate lookup

Do not copy duplicate detection that can locate another user's record by checksum and return its media identifier. Duplicate checks must be scoped to the authenticated user or use a privacy-preserving global deduplication design that never exposes cross-user identity or metadata.

### Dashboard-first Home

Do not adopt the Pro subscription/storage-stat dashboard as the primary SnapNext experience. Main SnapNext remains memory-, relationship- and story-first.

### Unverified enterprise claims

Do not import claims such as end-to-end encryption, SOC 2 readiness, guaranteed sub-second APIs, complete CSRF protection, exact test-coverage percentages or compliance status unless independently implemented and verified.

### Premature infrastructure

Do not add Kubernetes, separate API services, Redis, BullMQ or other infrastructure solely because it appears more enterprise. Each service adds cost and operational failure modes and must solve a real production need.

## Production strategy

The preferred direction is:

**Main SnapNext product maturity + selected Pro engineering discipline.**

The main repository keeps its working Home, Vault/Gallery, Smart Sync, People/Favorites, Memories, AI, storage, billing, security and native foundations. The Pro experiment remains a place to test architecture ideas before deliberately porting the useful ones.
