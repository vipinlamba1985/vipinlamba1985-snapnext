# PLAN_ENTITLEMENT_AUDIT.md — Plans, Quotas & Feature Gates

Read from `lib/plans.js`, `lib/entitlements.js`, `app/api/plans/route.js`, `app/api/dev/effective-plan/route.js`, and the guard calls throughout `app/api/[[...path]]/route.js`.

---

## 1. Plan catalogue (source: `lib/plans.js`)

| Plan | `storageBytes` | `dailyAiCredits` | `monthlyAiCredits` | `downloadsPerDay` | `maxUploadBytes` | Stripe price env var |
|---|---:|---:|---:|---:|---:|---|
| `free` | 5 GB | 5 | 50 | 20 | 100 MB | — (no checkout) |
| `plus` | 100 GB | 50 | 1000 | 500 | 500 MB | `STRIPE_PRICE_PLUS` |
| `pro` | 2 TB | 200 | 5000 | 2000 | 2 GB | `STRIPE_PRICE_PRO` |
| `super_user` | 10 TB | 99999 | 99999 | 99999 | 5 GB | — (internal only) |

Exact numbers live in `lib/plans.js` — confirm before launch. `super_user` is intentionally unbounded and must never be assigned by public flow.

---

## 2. Entitlement model (source: `lib/entitlements.js`)

### 2.1 `ENTITLEMENT_PLANS`

Extended plan catalogue that adds `family` alongside the four billing plans above. Adds:
- Per-plan `features[]` array of feature keys (`upload.video`, `ai.chat`, `ai.videoScript`, `sharing.albums`, `favorites.reactions`, `exports.zip`, `imports.google`, `admin.dashboard`, `dev.effectivePlanOverride`, ...).
- Concurrent AI call ceilings.
- Effective storage overlay for Developer Test Mode.

### 2.2 `effectivePlan(user, request)`

Resolves the plan that should apply for a given request, in this order:
1. If `user.role === 'super_user' || user.role === 'admin'` → `super_user`.
2. If Developer Test Mode cookie `snapnext_dev_effective_plan` is present (only super users can set this) → the cookie value (after validation).
3. If Stripe subscription status = `active` → `subscription.plan`.
4. Otherwise → `user.plan` or `free`.

### 2.3 `entitlementForUser(user, request)`

Returns a resolved entitlement bag: `{ plan, storageBytes, aiDaily, aiMonthly, features, isSuperUser, isDeveloperOverride }`. This is the single source of truth consulted by every server-side guard.

### 2.4 Developer Test Mode

Controlled by two cookies (set via `/api/dev/effective-plan`):
- `snapnext_dev_profile` = JSON simulating a fake plan/storage/AI credits.
- `snapnext_dev_effective_plan` = plan key to override.

Only super users can toggle these. In production, `/api/dev/effective-plan` still checks `isSuperUser` — do NOT expose this to end-users.

---

## 3. Where plan gates are enforced

| Feature | Gate | Location |
|---|---|---|
| `/media/upload` | `storageBytes` remaining + `maxUploadBytes` per file | Monolith `case '/media/upload'` |
| `/exports POST` | `downloadsPerDay` | Monolith `case '/exports POST'` |
| `/billing/checkout` | Plan not `free` / `super_user` | Monolith `case '/billing/checkout'` |
| `/ai/*` | `preflightAiRequest` (credits + rate limit + `minPlan`) | `lib/ai-router.js` → `preflightAiRequest` |
| `/shared/photos` | Must be accepted favorite | Monolith `canViewOwnersResource` |
| `/shared/albums/:id` | Owner or member | Monolith `case '/shared/albums/:id'` |
| `/admin/*` | `isSuperUser` | Monolith `case '/admin/*'` |
| `/dev/effective-plan` | `isSuperUser` | Discrete route |

---

## 4. Storage accounting

On every request that touches storage:
- `/storage/usage` aggregates `sum(media.bytes)` where `media.userId === user.id && media.trashed !== true`.
- Compare against `entitlement.storageBytes`.
- If Developer Test Mode is active, overlay a synthetic usage figure so the UI can preview "almost full" states without actually uploading.

### Known gaps (backlog)

1. Storage counter is computed on every request; consider caching in a `user_stats` document with periodic reconciliation.
2. Trashed items still count towards storage until permanently deleted — documented behaviour, but confirm this matches the pricing page copy before launch.
3. Failed uploads that partially wrote to S3 could leak bytes not counted in Mongo. Recommend nightly reconciliation job.

---

## 5. AI credit accounting

- Per-feature cost defined in `lib/ai-router.js` (`FEATURE_CREDITS`).
- Daily rollover at UTC midnight (`day: YYYY-MM-DD` key).
- Monthly rollover on `1st of month UTC` (`month: YYYY-MM` key).
- `preflightAiRequest` returns `{ ok: false, reason: 'daily_cap' \| 'monthly_cap' \| 'min_plan' \| 'rate_limit' }` on violation.

### Known gaps

1. No test coverage on daily rollover (mocked time). Verify manually on staging by setting server clock forward before launch.
2. `ai_usage.day` uses `YYYY-MM-DD` string — keep timezone consistent (server-side UTC).

---

## 6. Super-user seeding

Production bootstrap: `POST /api/admin/seed-super` with header `X-Seed-Secret: <JWT_SECRET>`. Payload `{ email, name?, password? }`. Idempotent — promotes existing user to `super_user` if not already.

**Best practice for launch**:
1. Set `JWT_SECRET` in production to a strong random value.
2. Run the seed once via `curl` from a trusted IP.
3. Store the seed secret in the vault. Rotate after first seed.

---

## 7. Plan comparison exposure

`/api/plans` (and `app/api/plans/route.js`) both return the full `PLANS` object without redacting Stripe price env-var names. Confirm that returning `stripePriceId: process.env.STRIPE_PRICE_PLUS` (i.e. actual Stripe price IDs like `price_XXXX`) is acceptable to expose — it is standard practice and safe, but flag for review.

---

## 8. Recommendations before launch

1. **Freeze** plan quotas in `lib/plans.js` and mirror them in the marketing pages (`/`, `/billing/page.js`). Currently these can drift.
2. **Delete** or gate any UI that references quotas literally (e.g. "20 downloads per day") behind a shared `lib/plans.js` value — don't hardcode.
3. **Assert** that no Mongo user has `plan === 'super_user'` other than intentional admins. Run:
   ```js
   db.users.find({ plan: 'super_user' }, { email: 1, role: 1 })
   ```
4. **Document** the exact refund / downgrade behaviour on cancellation — currently `billing.handleStripeWebhook` sets `plan` back to `free` on `customer.subscription.deleted`. Confirm the UI communicates this.
5. **Rate-limit** `/auth/login` and `/auth/forgot` (independent of plan) — not present today, easy to add with `lib/ratelimit.js` (create if needed).
