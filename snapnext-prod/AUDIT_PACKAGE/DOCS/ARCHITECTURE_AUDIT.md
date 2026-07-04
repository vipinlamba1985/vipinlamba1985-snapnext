# ARCHITECTURE_AUDIT.md — SnapNext AI Next.js App

Exhaustive architecture map derived from the real code at `vipinlamba1985/vipinlamba1985-snapnext@main` on 04 Jul 2026.

---

## 1. Stack (as-shipped)

| Layer | Technology | Version | Where |
|---|---|---|---|
| Framework | Next.js App Router | `15.5.16` | `package.json` |
| React | React | `18.3.1` | `package.json` |
| Language | JavaScript + JSConfig path aliases (`@/*`) | — | `jsconfig.json` |
| Server runtime | Node.js, standalone (`server.js`) | Node 18+ | `next.config.js`, `server.js` |
| Auth | Supabase (`@supabase/supabase-js` 2.108.2) + legacy JWT (`lib/auth.js`) | — | `lib/supabase.js`, `lib/auth.js`, `middleware.js` |
| Database | MongoDB (`mongodb` 6.6.0) | 6.x | `lib/db.js` |
| Storage | AWS S3 (`@aws-sdk/client-s3` 3.713.0) with local-disk fallback | — | `lib/storage.js` |
| AI | OpenAI (`openai` 6.45.0) + Google GenAI (`@google/genai` 2.10.0) | — | `lib/ai-router.js`, `lib/gemini.js` |
| Billing | Stripe (`stripe` 17.5.0) | — | `lib/billing/*` |
| Email | Resend + Svix webhook signing | — | `lib/email/*` |
| UI | Radix UI primitives, shadcn/ui, Tailwind CSS `3.4.1`, framer-motion `11.18.0`, lucide-react `0.516.0`, sonner `2.0.5` | — | `components/`, `tailwind.config.js` |
| Data fetching | SWR `2.3.8`, React Query `5.56.2`, axios `1.16.0` | — | `package.json` |
| Package manager | Yarn Berry pinned via `packageManager` field | 1.22.22 | `package.json` |

Enforce `yarn` for installs. Never run `npm install` — lock-file drift will cascade.

---

## 2. Top-level layout

```
snapnext/
├── app/                        # Next.js App Router
│   ├── layout.js                # RootLayout (shared providers + theme)
│   ├── providers.js             # ClientProviders (toaster, theme, react-query, sonner)
│   ├── page.js                  # Marketing landing (unauth)
│   ├── login/                   # Supabase sign in
│   ├── signup/                  # Supabase sign up
│   ├── forgot-password/         # "Send reset link"
│   ├── reset-password/          # Reset password (token in URL)
│   ├── verify-email/            # Email verify handshake
│   ├── unsubscribe/             # Signed unsub link handler
│   ├── demo-login/              # Preview shortcut (now prod-gated)
│   ├── privacy/  terms/         # Legal pages
│   ├── auth/callback/route.js   # Supabase OAuth callback
│   ├── review-app/ merged-preview/ snapnext-v3/ # QA / preview shells
│   ├── (app)/                   # Authenticated route group — gated by middleware
│   │   ├── layout.js            # AppShell wrapper
│   │   ├── dashboard/page.js
│   │   ├── upload/page.js
│   │   ├── gallery/page.js
│   │   ├── memories/page.js
│   │   ├── life-graph/page.js
│   │   ├── journal/page.js
│   │   ├── health/page.js
│   │   ├── imports/page.js
│   │   ├── ai-studio/page.js
│   │   ├── ai-video/page.js
│   │   ├── ai-command/page.js
│   │   ├── ready-to-post/page.js
│   │   ├── favorites/page.js
│   │   ├── community/page.js
│   │   ├── chat/page.js
│   │   ├── downloads/page.js
│   │   ├── trash/page.js
│   │   ├── billing/page.js
│   │   ├── settings/page.js
│   │   ├── support/page.js
│   │   └── admin/ page.js billing/ emails/ storage/
│   └── api/                     # Server routes
│       ├── [[...path]]/route.js # THE MONOLITH — ~1500 lines, ~65 endpoints
│       ├── plans/route.js       # Public plans lookup
│       ├── dev/effective-plan/route.js
│       ├── ai-agent/            # Legacy AI OS entry points
│       └── ai-os/*              # 12 discrete AI-OS sub-routes
├── components/                  # shadcn/ui + local BrandLogo, AppShell, etc.
├── hooks/                       # use-mobile, use-toast
├── lib/                         # Server + client helpers (see §5)
├── middleware.js                # Auth gate for `(app)/*` route group
├── next.config.js
├── server.js                    # Custom Node entry for `next start`
├── tailwind.config.js  postcss.config.js  components.json (shadcn)
└── public/                      # Static
```

---

## 3. Routing model

1. **Marketing / unauth pages** live directly under `app/*` (`/`, `/login`, `/signup`, `/privacy`, `/terms`, …). They are never touched by middleware.
2. **Authenticated shell** lives under the `app/(app)/*` route group. The `(app)` segment is a Next.js *route group* — the URL segment `(app)` is stripped, so `app/(app)/dashboard/page.js` becomes `/dashboard`. Middleware matches on the URL after grouping (see `middleware.js` matcher list).
3. **Server routes** are under `app/api/*`. The catch-all `app/api/[[...path]]/route.js` handles ~65 endpoints (see `FEATURE_AUDIT.md`). Discrete routes exist for `plans`, `ai-os/*`, and legacy `ai-agent/*` — they don't route through the monolith.
4. **Auth callback** is `app/auth/callback/route.js` — Supabase OAuth redirect target.

### Middleware protected prefixes (source of truth: `middleware.js`)

```
/dashboard, /upload, /gallery, /memories, /life-graph, /journal, /health,
/imports, /ai-studio, /ai-video, /ai-command, /ready-to-post, /favorites,
/community, /chat, /downloads, /trash, /billing, /settings, /admin, /support
```

### Auth token resolution (post-fix)

```
Authorization: Bearer <t>       → preferred
  OR Cookie sb-access-token=<t> → fallback

↓

if t === 'preview-demo-token' && NODE_ENV !== 'production' → allow (dev only)
else if supabaseServer.auth.getUser(t).user               → allow
else                                                       → redirect to /login?next=<pathname>
```

---

## 4. Backend monolith — `app/api/[[...path]]/route.js`

Single file, ~1500 LOC, exports all HTTP verbs (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`) to the same `handle()` function which walks a giant `if (route === '…' && method === '…')` ladder.

See `FEATURE_AUDIT.md` for a per-endpoint enumeration.

**Cross-cutting concerns implemented inline in the handler:**

| Concern | How |
|---|---|
| CORS | `cors(res)` helper on every response |
| JSON serialisation | `json(data, status)` helper, always via `NextResponse.json` |
| Mongo `_id` scrubbing | `clean(doc)` strips `_id` and `passwordHash` |
| Auth | `requireUser(request)` → `getUserFromRequest` (`lib/auth.js`) |
| Entitlements | `effectivePlan(user, request)`, `entitlementForUser(user, request)`, `isSuperUser(user)` from `lib/entitlements.js` |
| AI dispatch | `runAiTask`, `getAiEntitlement`, `preflightAiRequest`, `getAiUsageSummary` from `lib/ai-router.js` |
| Storage | `storage.save`, `storage.read`, `storage.delete`, `storage.getReadUrl`, `storage.getUploadUrl` from `lib/storage.js` |
| Billing | `billing.createCheckoutSession`, `billing.createCustomerPortalSession`, `billing.getBillingStatus`, `billing.handleStripeWebhook`, `billing.health` from `lib/billing` |
| Email | `sendEmail`, `recordWebhookEvent`, `hasRealProvider`, `isProduction` from `lib/email` |
| Favorites (social) | `getFavoriteLink`, `setPerms`, `canViewOwnersResource`, `listAcceptedFavoriteUserIds`, `notify`, `FAVORITE_PERM_KEYS` from `lib/favorites.js` |
| Exports (ZIP) | `runExportJob`, `cleanupExpiredExports`, `createJob`, `EXPORT_DIR` from `lib/exports.js` |
| Insights | `computeInsights` from `lib/insights.js` |

**Weakness**: the router is a 1500-line function with no test surface. Recommended refactor path (P1 backlog): split into modules under `app/api/_handlers/{auth,media,memories,ai,billing,…}.js` and dispatch by prefix, so unit tests can target one module. Not done in this session (Option C — no rewrite).

---

## 5. `lib/` — responsibilities

| File | Purpose |
|---|---|
| `lib/db.js` | Single `getDb()` MongoDB client. Reads `MONGO_URL` or `MONGODB_URI`. Ensures indexes on `users.email` (unique), `media.userId+createdAt`, `media.userId+hash`. |
| `lib/supabase.js` | Three clients: `supabase` (browser anon), `supabaseServer` (SSR anon), `supabaseAdmin` (service-role). Env validation: URL must be `https://*.supabase.co`, keys must be > 20 chars. Exposes `isSupabaseConfigured`, `hasSupabaseServiceRole`. |
| `lib/auth.js` | Legacy JWT sign/verify (retained only for migration), `scrypt` password hashing, `getUserFromRequest` = preview-demo-token gate (now prod-gated) → Supabase token verification → legacy JWT fallback. `syncSupabaseUserToAppUser` upserts users into Mongo. |
| `lib/api-client.js` | Client-side `apiFetch()` wrapper that reads `snapnext_token` from `localStorage`, auto-refreshes via `/api/auth/refresh` on 401, and serves offline preview responses when the token is `preview-demo-token`. **Contains owner PII in `previewUser` — launch blocker, see MISSING_REQUIREMENTS.md.** |
| `lib/plans.js` | Base `PLANS` dictionary (`free`, `plus`, `pro`, `super_user`) with storage bytes, AI daily/monthly caps, download caps, max-upload bytes, Stripe price ID env-var lookups. |
| `lib/entitlements.js` | Extended `ENTITLEMENT_PLANS` (adds `family`), Developer Test Mode cookies (`snapnext_dev_profile`, `snapnext_dev_effective_plan`), storage/AI-credit/feature-flag simulation for super-users, `effectivePlan(user, request)`. |
| `lib/storage.js` | `local` and `s3` providers behind a common `storage.*` API. S3 client is lazy-loaded and never crashes at boot if env vars are missing. `STORAGE_PROVIDER=s3\|local`. Includes multipart upload primitives (not wired to UI yet). |
| `lib/gemini.js` | Direct Gemini SDK wrappers: `analyzeImage`, `analyzeVideo`, `transcribeAudio`, `askMemoryAssistant`. Every function now returns a `providerStatus` marker on failure instead of fabricated data. |
| `lib/ai-router.js` | Unified AI dispatcher: features (caption, hashtags, emojis, postIdeas, doAll, story, memorySummary, chat, vision, videoScript, audioTranscribe), per-plan credit caps, per-minute rate limiting, provider routing (OpenAI primary, Gemini vision, fallback), usage recording into `ai_usage`, history recording into `ai_history`. |
| `lib/ai-os.js` `lib/ai-agent-governance.js` `lib/ai-specialist-agents.js` `lib/ai-task-preview.js` `lib/ai-learning-engine.js` `lib/ai-safety-automation.js` `lib/ai-video-adapters.js` | Legacy AI-OS layer routed via `app/api/ai-os/*` and `app/api/ai-agent/*`. Not covered exhaustively here — see `AI_ARCHITECTURE_AUDIT.md`. |
| `lib/billing/index.js` | Stripe / mock billing provider dispatcher. `billing.createCheckoutSession`, `.createCustomerPortalSession`, `.handleStripeWebhook`, `.health`. |
| `lib/email/index.js` `lib/email/templates.js` `lib/email/tokens.js` | Resend + Svix webhook signature verification, HMAC-signed unsub tokens, `sendEmail({ template, to, userId, data, prefs, meta })`. |
| `lib/exports.js` | `archiver`-based ZIP export worker. `createJob`, `runExportJob`, `cleanupExpiredExports`, `EXPORT_DIR`. |
| `lib/favorites.js` | Social "favorites" graph (invite → accept → accepted), per-relationship permission matrix, notification helper. |
| `lib/insights.js` | Pure aggregation over `media` collection: totals, most-photographed month, duplicates, forecast. |
| `lib/clone-functions-adapter.js` | Legacy adapter (out of scope this session). |
| `lib/utils.js` | `formatBytes`, `cn` classname merger. |
| `lib/llm.js` | Minimal internal LLM helper (out of scope this session). |

---

## 6. Persistence model (MongoDB collections)

Collections referenced from the codebase (exhaustive):

| Collection | Owner | Written by | Read by |
|---|---|---|---|
| `users` | user | `syncSupabaseUserToAppUser`, `/auth/*`, `/admin/*` | `getUserFromRequest`, admin routes |
| `media` | user | `/media/upload`, `/media/text`, actions, bulk actions | `/media`, `/memories*`, `/gallery*`, `/insights`, `/ai/*` |
| `favorites` | user | `/favorites/invite`, `/favorites/:id/*` | `/favorites` |
| `favorite_permissions` | user | `setPerms` | `canViewOwnersResource` |
| `shared_photos` | user | `/shared/photos POST` | `/shared/photos GET` |
| `shared_albums` `shared_album_members` `shared_album_media` | user | `/shared/albums*` | idem |
| `shared_memories` | user | `/shared/memories POST` | `/shared/memories GET` |
| `memory_reactions` | user | `/shared/memories/:id/react` | (aggregate views not shipped) |
| `notifications` | user | `notify()` (favorites, shares, reactions) | `/notifications` |
| `email_events` | system | `sendEmail`, `recordWebhookEvent` | `/admin/emails` |
| `email_prefs` | user | (embedded on `users.emailPrefs`) | `settings/email-prefs` |
| `billing_status` | user | `billing.handleStripeWebhook` | `billing.getBillingStatus` |
| `subscriptions` | user | Stripe webhook | `/admin/billing/health` |
| `billing_events` | system | Stripe webhook | `/admin/billing/health` |
| `ai_usage` | user | `runAiTask.recordAiUsage` | `preflightAiRequest`, `getAiUsageSummary` |
| `ai_history` | user | `runAiTask.saveAiHistory` | `/ai/history` |
| `ai_generations` | user | (counted only by `getAiUsageToday`) | `/storage/usage` |
| `downloads` | user | `/downloads/log` | (out-of-scope) |
| `export_jobs` | user | `/exports POST`, worker | `/exports*` |

Indexes explicitly created in `lib/db.js`: `users.email (unique)`, `media.userId+createdAt (desc)`, `media.userId+hash`. Other read patterns rely on Mongo's default `_id` index. **Backlog**: add indexes for `ai_usage(userId, day)`, `ai_usage(userId, month)`, `favorites(requesterUserId, targetUserId, status)`, `shared_photos(recipientUserId, sharedAt)`, `export_jobs(userId, createdAt)`.

---

## 7. Rendering / provider tree

```
app/layout.js  → RootLayout (fonts, metadata, <html>, <body>)
  └─ app/providers.js  (ClientProviders)
       └─ next-themes  ThemeProvider
            └─ @tanstack/react-query  QueryClientProvider
                 └─ sonner  Toaster
                      └─ children
```

`app/(app)/layout.js` mounts `<AppShell>` (nav, header, side rail) around every authenticated route. Marketing pages skip the shell.

---

## 8. Boundary summary

| Boundary | Who holds it | Notes |
|---|---|---|
| Client ↔ Server | `lib/api-client.js` → `/api/*` | Client stores `snapnext_token` in `localStorage`. Cookie `sb-access-token` is also written for middleware. |
| Auth boundary | `middleware.js` + `getUserFromRequest` | Both now gate `preview-demo-token` on `NODE_ENV !== 'production'`. |
| Server ↔ Supabase | `lib/supabase.js` → Supabase API | Anon key SSR + browser; service-role for admin ops only. |
| Server ↔ Mongo | `lib/db.js` | Single client, connection pool implicit. |
| Server ↔ Storage | `lib/storage.js` | S3 lazy; local fallback for dev. |
| Server ↔ AI | `lib/ai-router.js`, `lib/gemini.js` | Provider selection driven by `AI_PROVIDER_*` env vars. |
| Server ↔ Stripe | `lib/billing` | Webhook signature verified via `STRIPE_WEBHOOK_SECRET`. |
| Server ↔ Resend | `lib/email` | Webhook signature verified via `RESEND_WEBHOOK_SECRET` (Svix). |

---

## 9. Deployment-time risks (documented, not fixed)

1. `next build` requires *all* runtime env vars to be present (Supabase, Mongo, Stripe, S3, AI keys). See `ENV_REQUIRED.md` for the full list. In our workspace no `.env*` files are populated, so `next build` cannot be authoritatively run — hence static validation via ESLint only in this session.
2. `lib/auth.js` currently forces `SECRET = 'fallback-build-secret-snapnext-secure-32chars'` when `JWT_SECRET` is missing in production. The production check is guarded by an `if (false && …)` that is intentionally dead code. **Recommend re-enabling** the check before shipping.
3. `app/api/plans/route.js` and `app/api/dev/effective-plan/route.js` are outside the monolith — test them separately.
4. The Gemini SDK model constants used (`gemini-3.5-flash`, `gemini-2.0-flash`, `gemini-3.1-flash-tts-preview`) must be validated against Google's live model roster at deploy time — model IDs drift.
5. The custom `server.js` entry means `next start` is not used — confirm your host runs `node server.js` on the correct port.

---

## 10. Recommended near-term refactors (P1 backlog)

1. Split `app/api/[[...path]]/route.js` into `app/api/_handlers/{auth,media,memories,ai,favorites,shared,billing,exports,insights,admin,webhooks}.js` and dispatch by prefix. This alone unlocks unit tests for every endpoint.
2. Move all remaining hardcoded personal names from client-side pages (`lib/api-client.js`, `dashboard/page.js`, `chat/page.js`, `life-graph/page.js`) into either `null` empty states or config-driven placeholders. See `MISSING_REQUIREMENTS.md` §1.
3. Add MongoDB indexes listed in §6 to `lib/db.js`.
4. Add server-side rate limiting on `/auth/login` and `/auth/forgot`.
5. Re-enable the JWT-secret production guard in `lib/auth.js` (remove the `if (false && …)`).
6. Consolidate the two AI layers (`lib/ai-router.js` vs `lib/ai-os.js`) into one — see `AI_ARCHITECTURE_AUDIT.md`.
