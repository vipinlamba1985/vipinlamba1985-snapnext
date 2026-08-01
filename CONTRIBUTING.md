# Contributing to SnapNext

SnapNext production changes should improve the existing product without weakening privacy, reliability, security or the memory-first user experience.

**Start with [`SNAPNEXT_BLUEPRINT_V4.md`](SNAPNEXT_BLUEPRINT_V4.md)** — the product
ideology and build doctrine. It holds the ten principles (P1–P10) this project is
reviewed against, the Four Concepts that define the product's structure, and a
step-by-step checklist for adding a feature. The rules below are the short form;
the blueprint explains why each exists and which test enforces it.

## Development rule

The main SnapNext repository is the production source of truth. Experimental repositories may inspire improvements, but their code, architecture and claims are not production-approved until deliberately ported and reviewed here.

## Before opening a pull request

1. Keep the change focused. Avoid unrelated rewrites.
2. Preserve existing product behavior unless the change intentionally replaces it.
3. Run `npm test`.
4. Run `npm run build`.
5. Run the relevant specialized checks when the change touches native or Docker behavior.
6. Update documentation when behavior, configuration or architecture changes.

The pull-request quality workflow also runs the repository test suite and production build.

## Product rules

- Home remains memory-first rather than storage-dashboard-first.
- Use human language in user-facing screens.
- Keep primary navigation to five items. The shipped set is Home, Library, Add,
  Create and You (`PRIMARY_HREFS` in `components/AppShell.js`).
- Do not duplicate features across pages without a clear user need.
- The Library has exactly two views: **All** (`/gallery`, everything you own, never
  plan-gated) and **Magic** (`/gallery/magic`, the same photos organised by person).
  Magic is a lens over the library, not a second library. Organising by person
  belongs to Magic only. See `docs/LIBRARY_STRUCTURE.md`.
- "Trusted circle" is the people you share with; "Starred" is a photo you marked.
  Keep the two words distinct.
- AI must assist the user without requiring prompt-engineering knowledge.
- AI-generated personal facts must be grounded in real user media or metadata.
- Sharing must remain explicit, permission-controlled and private by default.
- Originals imported from external providers must not be modified.

## Security rules

- Never add fallback production secrets.
- Never commit credentials, API keys or tokens.
- Authentication and authorization must fail closed in production.
- All data queries must be scoped to the authenticated user or an explicitly authorized shared resource.
- Do not introduce a second authentication system beside the approved production path.
- Do not store production session tokens in JavaScript-readable browser storage when a safer server-managed session mechanism is available.
- Validate write inputs and file metadata at server boundaries.
- Never claim compliance, encryption or security controls that are not actually implemented and verified.

## Architecture rules

- Prefer existing abstractions for storage, AI, billing, entitlements and Smart Sync.
- Add provider-specific behavior behind adapters.
- Every creative feature declares its billing in `lib/creative-credits.js`. A feature
  that calls an external model must reserve through `lib/ai-spend-gate.js` before
  running, then settle or release. A feature producing deterministic output from data
  the user already owns must not claim to charge credits.
- Prefer metadata over inference. `lib/triage.js`, `lib/trip-sharing.js` and
  `lib/post-composer.js` intentionally have no imports so they cannot reach a
  provider; keep them that way.
- Prefer incremental module extraction over large rewrites.
- Introduce a separately deployed worker/service only for a measured scaling or durability requirement.
- Keep experimental architecture out of production until there is a concrete benefit and migration plan.

## Testing expectations

Bug fixes should include a regression test where practical. New security-sensitive, billing, sharing, upload, sync or entitlement behavior should have automated coverage.

For user-facing changes, verify mobile behavior and truthful empty/error states as well as the happy path.

## Commit style

Use clear conventional prefixes when practical:

- `feat:` new behavior
- `fix:` bug or regression fix
- `security:` security hardening
- `refactor:` behavior-preserving restructuring
- `test:` automated test changes
- `docs:` documentation
- `ci:` workflow/tooling changes
- `chore:` maintenance

## Pull request description

State:

- what changed;
- why it is needed;
- what user behavior is affected;
- what was tested;
- any deployment, data, security or rollback considerations.

Do not describe planned behavior as already implemented.
