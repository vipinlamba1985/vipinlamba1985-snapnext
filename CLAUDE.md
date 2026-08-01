# CLAUDE.md

Guidance for Claude Code (and other AI assistants) working in this repository.

## What this is

SnapNext (`snapnext-ai`) is a memory-first photo/video management product: import from
phones and cloud providers, organize with AI (people, moments, "Magic Library"), restore
old photos, chat/share privately, and manage family/circles access. It ships as a Next.js
web app and as an iOS/Android app via Capacitor (the native app loads the deployed web
app rather than bundling it locally).

Note: `README.md` and `metadata.json` at the repo root are stale leftovers from the
project's original AI-Studio/Gemini scaffold and do not describe the current product —
prefer this file and `CONTRIBUTING.md` for accurate setup/behavior info.

## Stack

- **Framework**: Next.js 15 (App Router only, no `pages/`), React 18. `output: 'standalone'`.
- **Language**: JavaScript, not TypeScript (`jsconfig.json`, `components.json` sets
  `tsx: false`). TypeScript is only incidentally present (`capacitor.config.ts`,
  `next.config.js` sets `typescript.ignoreBuildErrors: true` and
  `eslint.ignoreDuringBuilds: true` — build-blocking type/lint errors are currently off).
- **UI**: shadcn/ui (`components/ui/*.jsx`, style "new-york") + Radix primitives +
  Tailwind CSS + `lucide-react` icons + `framer-motion`.
- **Data/state**: `@tanstack/react-query`, `swr`, `react-hook-form` + `zod`.
- **Database**: MongoDB via the official driver, no ORM (`lib/db.js`).
- **Auth**: Supabase Auth is primary; a legacy custom JWT path still exists for
  pre-migration sessions (`lib/auth.js`, `lib/supabase.js`).
- **Storage**: AWS S3 (`@aws-sdk/client-s3`), face/people recognition via AWS Rekognition.
- **AI providers**: OpenAI, Google Gemini (`@google/genai`), plus Groq/OpenRouter/
  HuggingFace behind an in-house routing/budget layer (`lib/ai-*.js`).
- **Billing**: Stripe, with an entitlements/plans layer on top (`lib/entitlements.js`,
  `lib/plans.js`).
- **Mobile**: Capacitor (`native/`, `native-web/`, `capacitor.config.ts`) — app id
  `ai.snapnext.app`.
- **Deploy**: Vercel (cron jobs defined in `vercel.json`) and/or Docker (`Dockerfile`,
  `docker-compose.yml`) running a custom `server.js` (not `next start`).

## Repository layout

```
app/
  (app)/          # authenticated product shell — route group, ~30 pages
                   #   (dashboard, gallery, upload, magic-library, memories,
                   #    billing, admin, settings, family, circles, chat, ...)
                   #   wrapped by app/(app)/layout.js -> AppShell
  api/             # Next.js Route Handlers = the backend, ~50 route folders
                   #   (auth, media, billing, ai-*, smart-sync, chat-e2ee, cron,
                   #    webhooks/stripe, family*, memory-*, restoration*, ...)
  login/, signup/, forgot-password/, reset-password/, verify-email/,
  privacy/, terms/, ai-policy/, child-safety/, family-safety/, ...  # public pages
  layout.js, providers.js, globals.css
middleware.js      # runs on /api/* and protected page prefixes: request IDs,
                    # CORS allowlist, body-size/content-type checks, per-route
                    # rate limiting, and a lightweight auth gate (real token
                    # validation happens per-route via lib/auth.js)
components/
  ui/              # shadcn primitives (generated — prefer using, not hand-editing)
  marketing/, magic-library/, protection/, smart-sync/, dev-ai/
  AppShell.js, BrandLogo.js, ...  # loose top-level shared components
lib/                # the bulk of business logic — 116 files
  db.js, auth.js, supabase.js, storage.js, entitlements.js, plans.js
  ai-*.js           # AI routing/supervisor/credits/safety/agents
  people-*.js       # face/people recognition (Rekognition)
  protection-*.js   # backup/protection pipeline
  chat-e2ee-*.js    # encrypted chat
  distributed-rate-limit.js
  auth/, ai/, billing/, constants/, email/, favorites/, restoration/,
  sharing/, smart-sync/   # feature subfolders
hooks/              # shared React hooks (use-mobile, use-toast, ...)
native/, native-web/  # Capacitor native config + web shell
scripts/            # native bootstrap/preflight, policy checks, smoke test
tests/              # *.test.mjs — the real, CI-enforced test suite
docs/               # feature-specific runbooks/QA/architecture notes (~29 files)
```

Root-level Python scripts (`backend_test*.py`, `test_*.py`, `auth_backend_test.py`,
`comprehensive_backend_verification.py`, `p0_entitlement_test.py`, etc.) are **not**
a separate backend and **not** part of CI — there is no Python service anywhere in
this repo. They're standalone `requests`-based scripts that hit a running instance
at `http://localhost:3000/api` with manual `assert`s, left over from earlier ad-hoc
verification work. Treat `tests/*.test.mjs` as the source of truth for automated
backend/frontend test coverage.

## Development workflow

```bash
npm install
cp .env.example .env.local   # fill in required vars, see docs/ENV_REQUIRED.md
npm run dev                  # next dev on 0.0.0.0:3000
```

Key npm scripts:
- `npm run build` — runs `npm test` **then** `next build` (tests gate the build; don't
  bypass this by calling `next build` directly when validating a change).
- `npm start` — `node server.js` (custom server; not `next start`).
- `npm test` — `node --test tests/*.test.mjs` (Node's built-in test runner — no Jest/
  Vitest/Playwright config exists).
- `npm run lint` — `next lint` (`.eslintrc.json` extends `next/core-web-vitals` only,
  no Prettier config).
- `npm run test:smoke` — `scripts/smoke-test.mjs`.
- `npm run policy:android` / `policy:ios` — store-policy compliance checks.
- `npm run native:*` — Capacitor bootstrap/sync/add/open for iOS/Android.

CI (`.github/workflows/`): `quality.yml` runs `npm run build` on PRs (test+build gate);
`quality-visibility.yml` additionally runs non-blocking TS/lint/`npm audit` checks;
`docker.yml` builds and health-checks the Docker image; `native-preflight.yml` gates
changes under native paths.

## Environment variables

See `.env.example` / `.env.docker.example` and `docs/ENV_REQUIRED.md` for the full,
current list. Broad categories: MongoDB (`MONGODB_URI`/`MONGO_URL`, `DB_NAME`), Supabase
auth (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_SUPABASE_*`), legacy JWT (`JWT_SECRET`), storage/S3
(`STORAGE_PROVIDER`, `AWS_*`, `S3_BUCKET`), cloud sync connectors (Google Drive/Photos,
Dropbox, OneDrive), AI providers (`OPENAI_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`,
`OPENROUTER_API_KEY`, `HUGGINGFACE_API_KEY`, plus per-task cost caps), billing
(`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`), and app URLs (`NEXT_PUBLIC_APP_URL`, etc).
Never commit real values for any of these.

## Conventions and rules (see `CONTRIBUTING.md` for the full, authoritative list)

Product:
- Primary navigation is exactly **Home, Vault, Stories, Create, People** — home stays
  memory-first, not a storage dashboard. Don't add nav items or duplicate features
  across pages without a clear user need.
- Use plain, human language in user-facing copy; AI must assist without requiring
  prompt-engineering knowledge from the user.
- Originals imported from external providers must never be modified in place.
- Sharing is explicit, permission-controlled, and private by default.

Security:
- Auth/authorization must fail closed in production — never add fallback production
  secrets or a second authentication system alongside Supabase Auth.
- Every data query must be scoped to the authenticated user or an explicitly
  authorized shared resource.
- Validate write inputs and file metadata at server (route handler) boundaries.
- Never claim a security/compliance/encryption control that isn't actually
  implemented and verified.

Architecture:
- Reuse existing abstractions for storage (`lib/storage.js`), AI (`lib/ai-*.js`),
  billing (`lib/plans.js`, `lib/entitlements.js`), and Smart Sync before adding new ones.
  Put provider-specific behavior behind adapters. Reuse `components/ui/*` (shadcn)
  before hand-writing similar UI.
- Prefer incremental extraction over large rewrites; don't introduce a separately
  deployed worker/service without a measured scaling/durability need.

Testing:
- Bug fixes should include a regression test where practical.
- New security-sensitive, billing, sharing, upload, sync, or entitlement behavior
  needs automated coverage in `tests/*.test.mjs`.
- For user-facing changes, check mobile behavior and real empty/error states, not
  just the happy path.

Commits (conventional prefixes used throughout history): `feat:`, `fix:`, `security:`,
`refactor:`, `test:`, `docs:`, `ci:`, `chore:`.

Before opening a PR: run `npm test`, run `npm run build`, run native/Docker-specific
checks if those areas changed, and update docs when behavior/config/architecture changes.

## Where to look for more

- `CONTRIBUTING.md` — full contribution rules (read before making product/security/
  architecture-affecting changes).
- `docs/` — feature-specific runbooks, QA notes, and architecture docs (e.g.
  `ARCHITECTURE.md`, `ENV_REQUIRED.md`, `DOCKER_SETUP.md`, `AI_PROVIDER_ROUTER.md`,
  `SMART_SYNC_*`, `PHOTO_RESTORATION_*`, `NATIVE_LAUNCH_RUNBOOK.md`,
  `MOBILE_LAUNCH_QA.md`, `UX_IMPLEMENTATION_BRIEF.md`).
- `SNAPNEXT_MASTER_ENGINEERING_BIBLE.md` / `SNAPNEXT_V3_SOURCE_OF_TRUTH.md` — longer-form
  product philosophy, UX/branding, and technical vision documents. These read as
  aspirational/design-direction references rather than a description of current shipped
  state — cross-check against actual code before relying on them.
