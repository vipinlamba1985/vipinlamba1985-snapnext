# CONNECTION_AUDIT.md — Wire Map (client ↔ API ↔ stores)

How every UI page connects to its data source. Read from `lib/api-client.js`, every `app/(app)/**/page.js`, the monolith router, and the discrete `route.js` files.

---

## 1. Client-side transport (source: `lib/api-client.js`)

```
UI page
 ↓ apiFetch(path, opts)
     ├─ Adds Authorization: Bearer <snapnext_token from localStorage>
     ├─ If token === 'preview-demo-token' → short-circuits to previewResponse()  [DEV ONLY]
     ├─ On 401 → POST /api/auth/refresh → retries once
     └─ Otherwise → fetch(process.env.NEXT_PUBLIC_APP_URL + path)
```

Token storage:
- `localStorage.snapnext_token` → primary bearer.
- `localStorage.snapnext_access_token` → mirrored for compatibility.
- Cookie `sb-access-token` → written server-side on login response so middleware can see it.

---

## 2. Page-by-page wiring

| Page | Reads | Writes |
|---|---|---|
| `/dashboard` | `/auth/me`, `/storage/usage`, `/media`, `/memories`, `/insights`, `/insights/ai-summary` | `/media/text`, `/media/upload`, `/media/:id/favorite`, `/media/:id/trash` |
| `/upload` | `/storage/usage` | `/media/upload` (multipart), `/media/presign-upload` |
| `/gallery` | `/media` | `/media/bulk`, `/media/:id/(favorite\|trash\|restore\|delete)` |
| `/memories` | `/memories/timeline` | `/ai/image-to-video`, `/ai/generate-reel` |
| `/journal` | `/memories/timeline` | — |
| `/life-graph` | `/favorites/ai`, `/media` | — (heavy in-page mock data, see MISSING_REQUIREMENTS.md) |
| `/health` | `/insights` | — |
| `/imports` | client-only Google Photos flow (out of scope) | — |
| `/ai-studio` | `/ai/history` | `/ai/(caption\|hashtags\|emojis\|post-ideas\|story)` |
| `/ai-video` | — | `/ai/(generate-reel\|image-to-video)` |
| `/ai-command` | AI-OS status routes | — |
| `/ready-to-post` | — | `/ai/(caption\|hashtags\|emojis)` |
| `/favorites` | `/favorites`, `/favorites/ai` | `/favorites/invite`, `/favorites/:id/(accept\|decline\|cancel\|remove\|block)`, `/favorites/:id/permissions` |
| `/community` | `/shared/photos`, `/shared/albums`, `/shared/memories`, `/notifications` | `/shared/photos`, `/shared/albums`, `/shared/albums/:id/*`, `/shared/memories`, `/shared/memories/:id/react` |
| `/chat` | — | `/ai/chat` |
| `/downloads` | `/exports` | `/exports`, `/downloads/log` |
| `/trash` | `/media?filter=trash` | `/media/:id/(restore\|delete)`, `/media/bulk` |
| `/billing` | `/plans`, `/billing/status` | `/billing/checkout`, `/billing/portal` |
| `/settings` | `/auth/me`, `/settings/email-prefs` | `/settings/email-prefs`, `/auth/verify/send`, `/auth/delete-account` |
| `/admin/*` | `/admin/*` | `/admin/grant-super`, `/admin/seed-super` (via curl) |
| `/support` | static | — |
| `/unsubscribe` | `/unsubscribe?token=` (GET) | `/unsubscribe` (POST) |

---

## 3. Server-side external calls

### 3.1 Supabase

- `signUp`, `signInWithPassword`, `signOut`, `refreshSession`, `getUser` — SSR anon client.
- `admin.deleteUser` — service-role client (only in `/auth/delete-account` and admin paths).
- `verifyOtp` — for password reset & email verification.

### 3.2 MongoDB

All queries go through `getDb()` returning the singleton `MongoClient`. Collections listed in `ARCHITECTURE_AUDIT.md` §6.

### 3.3 S3

- `PutObject`, `GetObject`, `HeadObject`, `DeleteObject`, `getSignedUrl(command)` — via `lib/storage.js`.
- Multipart primitives: `CreateMultipartUpload`, `UploadPart`, `CompleteMultipartUpload`, `AbortMultipartUpload`. Not currently wired to UI (backlog).

### 3.4 Stripe

- `checkout.sessions.create` — `/billing/checkout`.
- `billingPortal.sessions.create` — `/billing/portal`.
- `subscriptions.retrieve`, `customers.retrieve` — read on demand.
- `webhooks.constructEvent(payload, sig, secret)` — `/webhooks/stripe`.

### 3.5 Resend

- `emails.send({ from, to, subject, html })` — `lib/email`.
- Webhook signature via Svix.

### 3.6 Gemini / OpenAI

See `AI_ARCHITECTURE_AUDIT.md` §2.2.

---

## 4. Failure surfaces & retry semantics

| Call | On failure | UI behaviour |
|---|---|---|
| `apiFetch → /api/*` | 401 → `/auth/refresh` retry; else throws | Toast + skeleton → empty state |
| `analyzeImage` inline in upload | Returns `unavailableImageAnalysis()` | Upload still succeeds; `aiAnalysis` empty |
| Stripe webhook | 503 if secret missing; 400 if bad sig | Retried by Stripe |
| Resend webhook | 401 if bad sig | Retried by Svix |
| S3 read | 500 with `storage_unavailable` | UI shows retry banner |
| Mongo down | 500 | UI shows global error banner |

---

## 5. Known gaps

1. `apiFetch` retries only on 401, not on 5xx or network errors — clients spin instead of showing errors. Recommend exponential backoff with max 2 retries.
2. No end-to-end request tracing (no `x-request-id` propagation). Add before scaling support.
3. `/media/:id/file` uses `?t=<token>` fallback which puts the token in URLs — fine for streamed downloads but avoid logging query strings.
4. Websocket / SSE not used; all real-time behaviour is short-poll based (`/notifications`).

---

## 6. Sequence diagram — login → dashboard

```
User → /login  (unauth page)
  → POST /api/auth/login  { email, password }
    Supabase.signInWithPassword → { access_token, refresh_token, user }
    syncSupabaseUserToAppUser → upsert users doc in Mongo
    Response  ← { access_token, user }

Client stores `snapnext_token` + `snapnext_user` → router.push('/dashboard')

On /dashboard render:
  → apiFetch('/api/auth/me')             → { user }
  → apiFetch('/api/storage/usage')       → { bytesUsed, bytesLimit, count, aiUsedToday }
  → apiFetch('/api/media?limit=8&filter=all') → { media: […] }
  → apiFetch('/api/memories')            → { months: […], onThisDay: […] }
  → apiFetch('/api/insights')            → { totals, mostPhotographed, duplicates, forecast }
```
