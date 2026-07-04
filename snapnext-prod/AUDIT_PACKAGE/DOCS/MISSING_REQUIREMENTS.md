# MISSING_REQUIREMENTS.md — Launch Blockers & Backlog

Every gap discovered during this audit, ranked by launch impact. **P0 = launch blocker.** **P1 = should be fixed within a week of launch.** **P2 = nice to have.**

Status legend:
- ✅ Fixed this session (see `CHANGED_FILES.md`).
- 🔴 Not fixed — must be handled before public launch.
- 🟠 Not fixed — handle within the first week.
- 🟡 Backlog — non-blocking.

---

## 1. Fabricated personal data ("no mock personal data" rule)

| # | Severity | File | Description | Status |
|---|---|---|---|---|
| 1.1 | P0 | `app/(app)/journal/page.js` | Prior version rendered hardcoded fake user names, spouses, children, trips and AI observations. | ✅ |
| 1.2 | P0 | `middleware.js` | `preview-demo-token` bypass ran in production. | ✅ |
| 1.3 | P0 | `lib/auth.js` | Server-side `getUserFromRequest` accepted `preview-demo-token` in production and returned owner PII. | ✅ |
| 1.4 | P0 | `app/demo-login/page.js` | Route stored `preview-demo-token` in localStorage in production and preloaded owner PII. | ✅ |
| 1.5 | P0 | `app/api/[[...path]]/route.js` `/memories/timeline` | Hardcoded `'sarika'` keyword classifier. | ✅ |
| 1.6 | P0 | `app/api/[[...path]]/route.js` `/memories/timeline` | Pre-written `monthlyRecap` / `yearlyRecap` narratives. | ✅ |
| 1.7 | P0 | `app/api/[[...path]]/route.js` `/favorites/ai` | Fabricated emotional-highlight claim about people. | ✅ |
| 1.8 | P0 | `app/api/[[...path]]/route.js` `/ai/audio-transcribe` | Fabricated default transcript string. | ✅ |
| 1.9 | P0 | `lib/gemini.js` `analyzeImage` prompt | Contained the owner's family names (`Sarika`, `Vipin`). | ✅ |
| 1.10 | P0 | `lib/gemini.js` `analyzeImage` default description | Fabricated fallback description. | ✅ |
| 1.11 | P0 | `lib/gemini.js` `transcribeAudio` fallbacks | Two fabricated placeholder transcripts. | ✅ |
| 1.12 | P0 | `lib/gemini.js` `askMemoryAssistant` | Prompt example referenced `Sarika`; error fallback referenced `Goa` / birthday highlights. | ✅ |
| 1.13 | P0 | `lib/gemini.js` `mockImageAnalysis` | Fabricated family + location data. Aliased to unavailable. | ✅ |
| 1.14 | P0 | `lib/gemini.js` `mockVideoAnalysis` | Fabricated cinematic chapters. Aliased to unavailable. | ✅ |
| 1.15 | **P0** | `lib/api-client.js` | Client-side `previewUser` still contains **`name: 'Vipin Lamba'`, `email: 'vipin.lamba1985@gmail.com'`** and `previewMedia` contains 3 fabricated demo items. Also `previewResponse` returns fabricated insight strings such as `"Your memories are safely organized."`. This is loaded any time the client has `preview-demo-token` in localStorage — which in production can happen if the browser was previously used in dev mode. | 🔴 |
| 1.16 | **P0** | `app/(app)/dashboard/page.js` (`searchSuggestions`, four placeholder strings, four `preview-demo-token` client branches) | Hardcoded `Sarika`, `Sarika lamba`, `Dubai`, `Goa`, `sarika, rain, sunset`. Rendered in search suggestions, prompt placeholders, and tag placeholders. | 🔴 |
| 1.17 | **P0** | `app/(app)/chat/page.js` (line 294) | Hardcoded suggested prompt `"Beach pictures with Sarika"`. | 🔴 |
| 1.18 | **P0** | `app/(app)/life-graph/page.js` | Extensive fabricated family graph: `Sarika`, `Sarika (Partner)`, `Sarika lamba`; hardcoded `2,345 memories`, `15 travel landmarks`, `412 beautiful memories with Sarika this year`, `8 holidays` etc. Every user sees the owner's fake family tree. **This is the single biggest remaining PII leak.** | 🔴 |
| 1.19 | P1 | `app/(app)/dashboard/page.js` AI story fallback strings | "A truly unforgettable chapter full of quiet joy and shared warmth." "This story highlights the unique scenery, heartfelt connections, and magical essence of the day." Used when the AI story request fails; not personal-name PII but qualifies as fabrication. | 🟠 |
| 1.20 | P1 | `app/(app)/dashboard/page.js` upload success caption fallback | "An amazing aesthetic highlight filled with warmth and peaceful vibes. Perfectly archived." Rendered as if from AI. | 🟠 |
| 1.21 | P1 | Assorted marketing copy strings baked into API responses (e.g. `motionEffect` preset name/description, `"Premium cinematic motion prompt generated."`) | Not personal-name PII but should be flagged as canned marketing copy. | 🟠 |

**How to close 1.15–1.18 in Session 2 (mandatory before public launch):**
1. In `lib/api-client.js`, gate the entire preview mode block behind `typeof window !== 'undefined' && process.env.NEXT_PUBLIC_ENABLE_PREVIEW === '1'`. Replace `previewUser` names/emails with generic `Preview Reviewer` / `preview@snapnext.local`.
2. In `dashboard/page.js`, replace `searchSuggestions` with an array of neutral prompts (`'Beach photos'`, `'Birthday'`, `'Travel'`, `'Wedding'`, `'Family'`, `'Food'`, `'Pets'`) — no personal names.
3. In `chat/page.js`, replace the suggested prompt with a neutral placeholder.
4. In `life-graph/page.js`, replace all in-page mock data with an empty state until real face-clustering data is wired via `/favorites/ai`. Route the page's people-list from `favoritePeople` returned by `/favorites/ai` (now truthful).

---

## 2. Auth & security

| # | Severity | Where | Description | Status |
|---|---|---|---|---|
| 2.1 | P0 | `middleware.js` → preview token gate | Preview bypass restricted to `NODE_ENV !== 'production'`. | ✅ |
| 2.2 | P0 | `lib/auth.js` → preview token gate | Same restriction now applied server-side. | ✅ |
| 2.3 | P0 | `app/demo-login/page.js` | Route now renders "not available" screen in prod. | ✅ |
| 2.4 | P0 | `lib/auth.js` → JWT_SECRET fallback | `SECRET = 'fallback-build-secret-snapnext-secure-32chars'` is used when `JWT_SECRET` is absent. A production check exists but is gated by `if (false && …)` — dead code. **Re-enable before launch.** | 🔴 |
| 2.5 | P0 | `/auth/login`, `/auth/forgot` | No server-side rate limiting. Add Upstash or in-memory limiter before public launch. | 🔴 |
| 2.6 | P1 | `/media/:id/file?t=<token>` | Bearer token in query string. Confirm host does not log query strings. | 🟠 |
| 2.7 | P1 | `/exports/:id/download?t=<token>` | Same. | 🟠 |
| 2.8 | P1 | CORS | `cors(res)` sets `Access-Control-Allow-Origin: *` on every response. Restrict to `NEXT_PUBLIC_APP_URL` origin. | 🟠 |
| 2.9 | P1 | Content-Security-Policy | No CSP headers set. Add via `next.config.js`. | 🟠 |
| 2.10 | P2 | `admin/seed-super` bootstrap | Only guard is `X-Seed-Secret` header. Add IP allowlist for the initial run. | 🟡 |

---

## 3. Data integrity & storage

| # | Severity | Where | Description | Status |
|---|---|---|---|---|
| 3.1 | P1 | Storage bytes counter | Recomputed on every request. Cache with periodic reconcile. | 🟠 |
| 3.2 | P1 | Trashed media | Still counts toward quota until permanently deleted. Confirm this matches pricing page copy. | 🟠 |
| 3.3 | P1 | Failed S3 upload orphans | Consider nightly reconciliation job. | 🟠 |
| 3.4 | P1 | Mongo indexes | Add `ai_usage(userId, day)`, `ai_usage(userId, month)`, `favorites(requesterUserId, targetUserId, status)`, `export_jobs(userId, createdAt)`. | 🟠 |
| 3.5 | P2 | `ai_history` retention | Add TTL index (365 days). | 🟡 |

---

## 4. AI

| # | Severity | Where | Description | Status |
|---|---|---|---|---|
| 4.1 | P0 | All `analyze*` / `transcribe*` / `askMemoryAssistant` | Truthful `providerStatus` markers introduced. | ✅ |
| 4.2 | P1 | `/media/upload` runs AI synchronously | Slows uploads. Move to worker. | 🟠 |
| 4.3 | P1 | Model IDs | Confirm `gemini-3.5-flash` / `gpt-4o-mini` etc. against live provider rosters at deploy. | 🟠 |
| 4.4 | P2 | AI history size cap | None. | 🟡 |
| 4.5 | P2 | `/ai/health` endpoint | Not present. | 🟡 |
| 4.6 | P2 | Prompt injection guard | Strip `system:` / `assistant:` role markers from user chat queries. | 🟡 |

---

## 5. UI polish (not launch blockers, but noted)

- Every "empty state" needs to conform to `REFERENCE_VISUAL_POLICY.md`.
- All hardcoded personal names in placeholder texts must go (see §1.16–1.18).
- Confirm every consumer of `providerStatus` renders an honest "unavailable" state.
- Add an `ErrorBoundary` around each authenticated route.

---

## 6. Backend refactor debt

- Split `app/api/[[...path]]/route.js` into `app/api/_handlers/{auth,media,memories,ai,favorites,shared,billing,exports,insights,admin,webhooks}.js`.
- Consolidate `lib/ai-router.js` + `lib/ai-os.js` into one dispatcher.
- Add `x-request-id` propagation and basic structured logging.

---

## 7. What is NOT in scope for this audit

- Payment localisation (currency, VAT).
- Multi-tenant / organisation accounts.
- GDPR / privacy policy legal review.
- Full accessibility (WCAG) audit.
- Performance profiling (Lighthouse / bundle size).
- SEO metadata / social share cards.

Each of these needs a dedicated pass.
