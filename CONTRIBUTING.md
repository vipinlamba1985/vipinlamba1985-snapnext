# Contributing to SnapNext

SnapNext production changes should improve the existing product without weakening privacy, reliability, security or the memory-first user experience.

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
- Keep primary navigation focused on Home, Vault, Stories, Create and People.
- Do not duplicate features across pages without a clear user need.
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
