# Phase 1 — Security & Truthfulness: Completed Changes

Working set intended for branch: `production/readiness-complete`
(This environment cannot push to GitHub. Use the platform's "Save to GitHub"
feature to push this workspace to that branch. Do not push directly to main.)

## Commit-sized change groups (suggested commit order)

### 1. security: fail-closed middleware + production-disable preview auth
- `middleware.js`
  - Supabase verification failures now FAIL CLOSED (redirect to /login; previously allowed access on exception).
  - `preview-demo-token` only authenticates when NODE_ENV and VERCEL_ENV are not production.
- `lib/auth.js`
  - `preview-demo-token` rejected server-side in production (`isPreviewAuthAllowed()`).
  - Removed hardcoded production fallback JWT secret (`fallback-build-secret-...` was publicly known and forgeable). Legacy token signing/verification is disabled in production unless a strong (32+ char) `JWT_SECRET` is configured.
- `app/api/[[...path]]/route.js` — `/auth/config` now returns `previewAllowed` flag.
- `app/demo-login/page.js` — checks `/api/auth/config`; refuses to create a demo session unless the server says preview is allowed; redirects to /login otherwise.

### 2. truth: remove fabricated personal data
- `app/(app)/journal/page.js` — REWRITTEN. Was 100% hardcoded fake personal data (names, trips, counts, fake "Re-Analyze" button). Now renders only real data from `/api/journal/summary`, grounded AI narrative on demand, polished truthful empty state.
- `app/(app)/life-graph/page.js` — REWRITTEN. Was 100% fabricated (fake partner/child nodes, fake trip landmarks, fake upcoming events). Now shows people/places detected in the user's own analyzed media with truthful empty states.
- `app/(app)/imports/page.js` — REWRITTEN. Was simulating OAuth connections, fake sync logs, fake file counts. Now honestly marks all connectors "Coming soon" and routes to the real upload flow.
- `app/(app)/dashboard/page.js` — removed personal names/places from search suggestions and input placeholders.
- `app/(app)/chat/page.js` — neutral, truthful starter prompts and welcome message.

### 3. truth: backend grounding + honest AI failures
- `lib/gemini.js`
  - `transcribeAudio` now THROWS structured errors instead of returning canned fake transcripts.
  - `analyzeVideo` no longer fabricates summaries from filenames; analyzes real video bytes (<= 15 MB inline) or returns an honest "unavailable" structure.
  - `analyzeImage` prompt no longer suggests personal names; explicit anti-fabrication rules; no fake default caption.
  - `askMemoryAssistant` grounding rules added; throws honest errors; removed fabricated fallback texts; removed dead `mockImageAnalysis` / `mockVideoAnalysis`.
- `app/api/[[...path]]/route.js`
  - `/ai/audio-transcribe` returns structured 502/503 errors — never a fake transcript.
  - `/memories/timeline` recaps are now deterministic factual statements computed from real media (removed "Year 2026 was defined by travel..." fabrication and a hardcoded personal name in matching).
  - `/favorites/ai` returns factual appearance counts, no emotional claims.
  - NEW `/journal/summary` (GET) and `/journal/narrative` (POST) — journal computed only from the authenticated user's real media; AI narrative strictly grounded in verified facts.
  - Video analysis call site passes real bytes.

### 4. billing: production safety
- `lib/billing/index.js` — mock customer-portal now also refuses to run in production (checkout already did).

### 5. ai: workspace gateway routing (production path unchanged)
- `lib/ai-router.js`
  - Optional `OPENAI_BASE_URL` support (unset in production = direct OpenAI, unchanged).
  - Gemini calls fall back to the OpenAI-compatible gateway (`gemini/gemini-3.5-flash`) only when no direct `GEMINI_API_KEY` exists and a gateway is configured.
  - `OPENAI_TEXT_MODEL` override (default `gpt-4o-mini`, unchanged).
- `lib/gemini.js` — same gateway fallback for upload-time image analysis.
- `.env` (workspace only, not committed) — Emergent Universal LLM gateway configured.

### 6. dev environment
- `.yarnrc` — `--install.ignore-engines true` (supabase-js 2.110 requires Node 22; container has Node 20; production hosts on Node 22 are unaffected).
- `docs/ENV_REQUIRED.md` — full environment variable matrix with launch-blocking classification.

## Verified in this workspace
- `yarn build` passes.
- Fail-closed middleware: /dashboard without token → 307 to /login.
- `/api/auth/config` → `previewAllowed:true` (dev only).
- Real AI caption via gateway (Gemini) — works.
- Upload → real, truthful image analysis (empty faces/locations for a blank image — no fabrication).
- `/journal/summary` + `/journal/narrative` — grounded output only.
- `/memories/timeline` — factual recaps.
- `/ai/audio-transcribe` — honest structured 503 (no GEMINI_API_KEY in workspace).
