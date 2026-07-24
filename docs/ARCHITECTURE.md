# SnapNext Architecture

## Product architecture decision

SnapNext remains a single production repository and a single product experience. The experimental SnapNext Pro repository is an engineering reference, not a replacement application.

The production architecture should adopt the strongest Pro ideas incrementally: clear domain ownership, strong automated quality gates, explicit interfaces, testable modules, background-job isolation where it becomes necessary, and truthful technical documentation.

A monorepo rewrite, a second authentication system, or a separate API service must not be introduced unless the existing architecture can no longer meet a measured product or scaling requirement.

## Product north star

SnapNext is a private AI-powered memory home, not a storage dashboard.

The primary user experience remains relationship- and memory-first:

1. Home
2. Vault
3. Stories
4. Create
5. People

Storage, infrastructure and administration are supporting capabilities rather than the product identity.

## Current production boundaries

### Web and application shell

`app/` owns Next.js App Router pages, layouts and route handlers. User-facing pages should use human language and remain mobile-first.

### Authentication and authorization

`lib/auth.js`, Supabase helpers and protected route middleware form the production authentication boundary. Supabase is the primary identity provider. Legacy tokens exist only for controlled migration compatibility and must fail closed in production.

Do not add a parallel custom JWT/password authentication system.

### Media and storage

`lib/storage.js` owns storage-provider behavior and verification. Upload success must only be reported after the stored object is verified. S3 direct uploads and multipart primitives remain behind the same storage abstraction.

### Smart Sync and imports

`lib/smart-sync/` and `/api/smart-sync/*` own discovery, prioritization, capacity checks, jobs and provider adapters. Source originals remain untouched.

Provider-specific code should stay behind adapters rather than leaking provider behavior into the UI.

### People, favorites and sharing

Favorites, face/person intelligence, permissions, shared photos, albums and memories form one relationship domain. Sharing is opt-in and user-controlled.

### Memories and AI

Memory understanding, insights, grounded AI actions and creation features must operate on verified user data. AI output must not invent personal facts when underlying media or metadata does not support them.

### Billing and entitlements

Plan limits, storage allowances, AI usage and billing decisions remain centralized in entitlement/billing modules. UI code must not independently recreate plan logic.

### Native applications

Capacitor/native shells extend the same SnapNext product and backend. Native-specific permissions and background behavior should be isolated behind native bridges and preflight checks.

## Engineering principles adopted from the Pro experiment

### 1. Domain ownership

New behavior should live in the domain that owns it rather than accumulating in shared catch-all code. Large existing files may be decomposed gradually when touched, but refactoring must preserve behavior and tests.

### 2. Explicit service contracts

UI components should call stable API/client functions. Storage providers, AI providers, cloud import providers and billing providers should be replaceable behind their existing abstractions.

### 3. Automated quality gates

Every pull request should pass the repository test suite and production build. Native and Docker checks remain separate specialized workflows.

### 4. Truthful documentation

Documentation may describe implemented behavior and clearly marked future architecture. It must never claim security, compliance, performance, encryption, resumability or test coverage that has not been verified in the repository or deployment.

### 5. Incremental extraction

A worker service, queue, or additional deployable service may be introduced only when a real workload requires independent scaling or durable background execution. The first candidates would be long-running media analysis, cloud synchronization and export/video generation.

Until then, keeping one deployable application reduces operational complexity and is preferred.

## Rules for future architecture changes

- Preserve working production behavior before restructuring code.
- Prefer extraction behind an interface over wholesale rewrites.
- Never replace the production authentication path with experimental auth code.
- Never expose storage provider terminology in normal user-facing screens.
- Never merge a feature based only on README claims; verify the implementation.
- Keep security controls fail-closed in production.
- Keep user data access scoped to the authenticated user at every query boundary.
- Add or update tests for meaningful product or security behavior changes.
- Treat experimental repositories as references until a change is deliberately ported and reviewed.

## When a monorepo becomes justified

Revisit a multi-package/monorepo layout only when at least one of these is true:

- a separately shipped mobile application needs a substantial shared TypeScript package;
- background workers must deploy and scale independently;
- multiple teams own independently versioned services;
- shared UI/domain packages have enough reuse to offset tooling complexity.

Until then, the production repository should remain simpler than the experiment.
