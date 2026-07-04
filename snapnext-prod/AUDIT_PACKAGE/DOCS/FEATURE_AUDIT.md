# FEATURE_AUDIT.md — Endpoint & Feature Enumeration

Exhaustive endpoint list read directly from `app/api/[[...path]]/route.js`, `app/api/plans/route.js`, `app/api/dev/effective-plan/route.js`, `app/api/ai-os/*`, `app/api/ai-agent/*`, `app/auth/callback/route.js`. Routes are grouped by concern and annotated with method, protection, plan gate, and data source.

Legend:
- **Guard**: `public` = no auth, `user` = `requireUser`, `super` = `isSuperUser`, `signed` = HMAC-verified webhook payload, `preview-only` = short-circuits when `token === 'preview-demo-token'` (dev only after fix).

---

## Authentication (`/auth/*`)

| Route | Method | Guard | Notes |
|---|---|---|---|
| `/auth/config` | GET | public | Returns `{ supabase, serviceRole }` config booleans. |
| `/auth/signup` | POST | public | Supabase `auth.signUp` + `syncSupabaseUserToAppUser`. Rejects if email exists (`409`). |
| `/auth/login` | POST | public | Supabase `signInWithPassword`. Returns access + refresh tokens + `user`. |
| `/auth/logout` | POST | user | Idempotent no-op; client-side clears storage. |
| `/auth/refresh` | POST | public | Refreshes Supabase session. |
| `/auth/me` | GET | user | Returns current `{ user }`. |
| `/auth/delete-account` | POST | user | Cascade-deletes all media (Mongo + storage), favorites, shares, exports, notifications, billing status, then user row and Supabase user. |
| `/auth/forgot` | POST | public | `resetPasswordForEmail`. Always returns 200 for enumeration safety. |
| `/auth/reset/verify` | GET | public (token) | Validates `token_hash` presence only. |
| `/auth/reset` | POST | public (token) | Verifies OTP, updates password via Supabase. |
| `/auth/verify/send` | POST | user | Resends Supabase signup email; in dev, returns `_devVerifyUrl`. |
| `/auth/verify` | GET | public (token) | Verifies OTP, sets `emailVerified: true`. |
| `/auth/callback` | GET | public | `app/auth/callback/route.js` — Supabase OAuth handshake target. |

## Plans & Storage (`/plans`, `/storage/*`)

| Route | Method | Guard | Notes |
|---|---|---|---|
| `/plans` | GET | public | Full `PLANS` from `lib/plans.js`. Also exposed via `app/api/plans/route.js`. |
| `/storage/usage` | GET | user | Bytes + count aggregate over `media`; overlaid with dev simulation profile if present; includes `aiUsedToday`. |

## Media core (`/media/*`)

| Route | Method | Guard | Notes |
|---|---|---|---|
| `/media/upload` | POST (multipart) | user | Enforces plan storage quota and single-upload byte limit, dedupes by SHA-256 hash, runs `analyzeImage` or `analyzeVideo` inline, persists doc. Fine-grained skip reasons (`duplicate`, `storage_full`, `too_large`, `cloud_storage_unavailable`, `storage_permission_denied`, `bucket_unavailable`, `connection_lost`, `storage_unavailable`). |
| `/media/text` | POST | user | Quick-thought text capture, stored as `kind: 'text'` with synthetic `aiAnalysis`. |
| `/media` | GET | user | Filtered list (`all\|photo\|video\|favorite\|trash`) + search across name / caption / tags / faces / locations / emotions / autoAlbum / textInside. Limit 500. |
| `/media/:id/file` | GET | user (Bearer OR `?t=<token>`) | S3: 302 to presigned URL. Local: streams through API. `?dl=1` for attachment. |
| `/media/:id/(favorite\|trash\|restore\|delete)` | POST | user | Owner-only mutation. |
| `/media/bulk` | POST | user | `{ ids, action }` — trash / restore / favorite / unfavorite / delete in bulk. |
| `/media/presign-upload` | POST | user | S3 direct upload URL; 400 if `STORAGE_PROVIDER != s3`. |

## Memories & Timelines (`/memories/*`)

| Route | Method | Guard | Notes |
|---|---|---|---|
| `/memories` | GET | user | Groups all media by month; also returns `onThisDay` (same MM-DD, past years). |
| `/memories/timeline` | GET | user | **FIXED THIS SESSION.** Classifies media into `onThisDay / familyJourney / travelHistory / childGrowth / relationship / petTimeline` via `aiAnalysis.tags/faces/autoAlbum`. Returns truthful count-based `monthlyRecap`, `yearlyRecap`. Removed `'sarika'` classifier keyword and fabricated narrative recaps. |

## AI (`/ai/*`)

| Route | Method | Guard | Feature | Notes |
|---|---|---|---|---|
| `/ai/status` | GET | user | any | Reports entitlement for a given `feature`. |
| `/ai/analytics` | GET | super | — | 30-day usage rollup. |
| `/ai/history` | GET | user | — | Last 100 `ai_history` records (soft-deletable). |
| `/ai/caption` | POST | user | `caption` (1 credit) | Uses `runAiTask('caption')`. Loads image bytes if `mediaId` provided. |
| `/ai/hashtags` | POST | user | `hashtags` (1) | — |
| `/ai/emojis` | POST | user | `emojis` (1) | — |
| `/ai/post-ideas` | POST | user | `postIdeas` (2, plus+) | — |
| `/ai/memory-summary` | POST | user | `memorySummary` (3, plus+) | — |
| `/ai/story` | POST | user | `story` (3, plus+) | JSON card array. |
| `/ai/chat` | POST | user | `chat` (1) | Full memory-search assistant. Feeds up to 100 recent media as `libraryContext`. Optional TTS via `voiceResponse: true` (Gemini TTS `gemini-3.1-flash-tts-preview`). |
| `/ai/audio-transcribe` | POST | user | `audioTranscribe` (2, plus+) | **FIXED THIS SESSION.** No more fabricated placeholder transcript; returns `{ transcript, providerStatus }`. |
| `/ai/generate-reel` | POST | user | `videoScript` (5, pro+) | Delegates to `runAiTask('videoScript')`. Title defaults to `"My Lifetime Highlights Reel"` if no theme — documented in `MISSING_REQUIREMENTS.md`. |
| `/ai/image-to-video` | POST | user | `videoScript` (5, pro+) | Returns a `motionEffect` metadata packet (Ken Burns pan-and-zoom preset). Preset copy strings (`"Warm light leaks & vintage emotional film overlays"`) documented in `MISSING_REQUIREMENTS.md` as generic marketing copy — not personal fabrication but should be trimmed for launch. |

### AI OS (`/ai-os/*`) — legacy layer

Each route is a standalone `route.js` under `app/api/ai-os/*`. Handlers are thin wrappers over `lib/ai-os.js`, `lib/ai-specialist-agents.js`, `lib/ai-learning-engine.js`, `lib/ai-safety-automation.js`, `lib/ai-video-adapters.js`. See `AI_ARCHITECTURE_AUDIT.md` for the full sub-map; endpoints exist for `agents`, `alerts`, `business`, `certification`, `feedback`, `governance`, `preview`, `safety`, `scorecards`, `status`, `video`.

### AI Agent (`/ai-agent/*`)

`app/api/ai-agent/route.js` + `app/api/ai-agent/debug/route.js` — older agent entry point kept for backwards compatibility. See `AI_ARCHITECTURE_AUDIT.md` §4.

## Favorites (social graph) (`/favorites/*`)

| Route | Method | Guard | Notes |
|---|---|---|---|
| `/favorites` | GET | user | Buckets: `accepted`, `incoming`, `outgoing`, `blocked`. |
| `/favorites/invite` | POST | user | Requires existing SnapNext user match; sends `favorites_invite` email; upserts pending record. |
| `/favorites/:id/(accept\|decline\|cancel\|remove\|block)` | POST | user (must be participant) | Role-aware state machine. `remove` cascades to `favorite_permissions`, `shared_photos`, `shared_album_members`, `shared_memories`. |
| `/favorites/:id/permissions` | GET,PUT | user (must be participant) | Reads/writes owner's per-relationship permission matrix (`FAVORITE_PERM_KEYS`). |
| `/favorites/ai` | GET | user | **FIXED THIS SESSION.** Truthful count-derived people insights (removed fabricated "You share the most emotional, joyful moments with X" narrative). |

## Shared content (`/shared/*`)

| Route | Method | Guard | Notes |
|---|---|---|---|
| `/shared/photos` | POST | user (favorite required) | Owner-only media → recipient; upsert per (owner, recipient, media). |
| `/shared/photos` | GET | user | Permission-checked list of items shared with the recipient. |
| `/shared/albums` | GET | user | `{ owned, shared }`. Shared albums are permission-checked. |
| `/shared/albums` | POST | user | Create album. |
| `/shared/albums/:id` | GET | user (owner or member) | Album + items + members. |
| `/shared/albums/:id/(invite\|remove-member\|add-media\|remove-media\|delete)` | POST | user (owner) | Album mgmt. |
| `/shared/memories` | POST | user (favorite required) | Create shared memory. |
| `/shared/memories` | GET | user | Recipient inbox. |
| `/shared/memories/:id/react` | POST | user (participant) | Emoji reaction + notification. |

## Notifications (`/notifications`)

| Route | Method | Guard | Notes |
|---|---|---|---|
| `/notifications` | GET | user | Latest 50 + unread count. |
| `/notifications/read` | POST | user | Bulk mark-read (optional `ids`). |

## Exports (`/exports/*`)

| Route | Method | Guard | Notes |
|---|---|---|---|
| `/exports` | POST | user | Kick off ZIP job. `type = selected \| all \| album \| memory`. Plan cap: `plan.downloadsPerDay`. |
| `/exports` | GET | user | List last 50 jobs; runs cleanup of expired jobs. |
| `/exports/:id` | GET | user (owner) | Job status. |
| `/exports/:id/download` | GET | user (Bearer OR `?t=<token>`) | Streams the completed ZIP once ready. `410` on expired. |
| `/exports/:id/retry` | POST | user (owner) | Restart a failed/expired job. |

## Insights (`/insights/*`)

| Route | Method | Guard | Notes |
|---|---|---|---|
| `/insights` | GET | user | `computeInsights(db, user, request)`: totals, most photographed, this month/year, duplicates, large videos, forecast. |
| `/insights/ai-summary` | POST | user | Builds a `facts[]` list from insights and runs `memorySummary` AI feature over it. |

## Billing & webhooks (`/billing/*`, `/webhooks/*`)

| Route | Method | Guard | Notes |
|---|---|---|---|
| `/billing/checkout` | POST | user | Rejects `free` and `super_user` plans. Delegates to Stripe (or mock provider). |
| `/billing/portal` | POST | user | Customer portal deep link. |
| `/billing/status` | GET | user | Combined billing status + effective plan. |
| `/webhooks/stripe` | POST | signed (`STRIPE_WEBHOOK_SECRET`) | Refuses if secret missing (503). |
| `/webhooks/resend` | POST | signed (Svix) | Records email events; refuses on missing/invalid signature. |

## Admin (`/admin/*`)

| Route | Method | Guard | Notes |
|---|---|---|---|
| `/admin/users` | GET | super | Up to 500 users. |
| `/admin/grant-super` | POST | super | Promote user to `super_user\|admin`. |
| `/admin/seed-super` | POST | secret-header (`JWT_SECRET`) | Bootstrap the first super-user; idempotent. |
| `/admin/billing/health` | GET | super | Stripe health + subscription counts + recent events. |
| `/admin/emails` | GET | super | Filterable email event log. |
| `/admin/storage/health` | GET | super | Storage provider health + media provider counts. |

## Settings & unsubscribe

| Route | Method | Guard | Notes |
|---|---|---|---|
| `/settings/email-prefs` | GET,PUT | user | Reads/writes `user.emailPrefs` (`product, community, favorites, marketing`). |
| `/unsubscribe` | GET,POST | signed unsub token | Verifies HMAC token, flips a single preference to `false`. |

## Downloads log

| Route | Method | Guard | Notes |
|---|---|---|---|
| `/downloads/log` | POST | user | Client tells server it downloaded a set of mediaIds (analytics). |

## Dev-only

| Route | Method | Guard | Notes |
|---|---|---|---|
| `/dev/effective-plan` | POST | super (Developer Test Mode) | Sets `snapnext_dev_profile` cookie. Enforced by `getDeveloperProfile` inside `entitlementForUser`. Discrete route: `app/api/dev/effective-plan/route.js`. |

---

## Endpoint totals

| Group | Count |
|---|---:|
| Auth | 13 |
| Plans/Storage | 2 |
| Media | 8 |
| Memories | 2 |
| AI (core) | 12 |
| AI-OS (legacy) | 11 discrete `route.js` files |
| AI-Agent (legacy) | 2 discrete `route.js` files |
| Favorites (social) | 6 |
| Shared content | 9 |
| Notifications | 2 |
| Exports | 5 |
| Insights | 2 |
| Billing / webhooks | 5 |
| Admin | 6 |
| Settings / unsubscribe | 3 |
| Downloads / dev | 2 |
| **Total** | **~90 endpoints across ~15 files** |

"~65 endpoints" (rough estimate in the handoff notes) was low; the accurate figure is closer to 90 once the discrete `/ai-os/*` and `/ai-agent/*` routes are counted. This audit uses the real number.

---

## Feature groups vs UI routes

| UI route | Backing endpoints |
|---|---|
| `/dashboard` | `/auth/me`, `/storage/usage`, `/media`, `/memories`, `/insights`, `/insights/ai-summary`, `/media/text`, `/media/upload`, `/media/:id/favorite`, `/media/:id/trash`, `/ai/post-ideas`, `/ai/caption` |
| `/upload` | `/storage/usage`, `/media/upload` (multipart), `/media/presign-upload` |
| `/gallery` | `/media`, `/media/bulk`, `/media/:id/*` |
| `/memories` | `/memories/timeline`, `/ai/image-to-video`, `/ai/generate-reel` |
| `/life-graph` | `/favorites/ai`, `/media` (heavy client-side mock data currently, see MISSING_REQUIREMENTS.md) |
| `/journal` | `/memories/timeline` (only). |
| `/health` | `/insights` |
| `/imports` | client-only imports flow (out of scope) |
| `/ai-studio` | `/ai/caption`, `/ai/hashtags`, `/ai/emojis`, `/ai/post-ideas`, `/ai/story`, `/ai/history` |
| `/ai-video` | `/ai/generate-reel`, `/ai/image-to-video` |
| `/ai-command` | `/ai/chat` + AI-OS status endpoints |
| `/ready-to-post` | `/ai/caption`, `/ai/hashtags`, `/ai/emojis` |
| `/favorites` | `/favorites*` |
| `/community` | `/shared/*`, `/notifications` |
| `/chat` | `/ai/chat` |
| `/downloads` | `/downloads/log`, `/exports*` |
| `/trash` | `/media?filter=trash`, `/media/:id/restore`, `/media/:id/delete` |
| `/billing` | `/billing/checkout`, `/billing/portal`, `/billing/status`, `/plans` |
| `/settings` | `/auth/me`, `/settings/email-prefs`, `/auth/delete-account`, `/auth/verify/send` |
| `/admin/*` | `/admin/*` |
| `/support` | static content |
