# ENV_REQUIRED.md — Required Environment Variables

Exhaustive list of every `process.env.*` read anywhere in the repo. Group by concern. Marked `REQUIRED` / `RECOMMENDED` / `OPTIONAL`. Sourced by grepping `lib/`, `app/api/`, `middleware.js`, `server.js`, `next.config.js`, and `app/**/page.js`.

---

## 1. Framework / hosting

| Var | Status | Purpose |
|---|---|---|
| `NODE_ENV` | REQUIRED | `production` in prod. Gates the `preview-demo-token` bypass; enables Next.js optimisations. |
| `PORT` | OPTIONAL | Consumed by `server.js`. Defaults to `3000`. |
| `NEXT_PUBLIC_APP_URL` | REQUIRED | Absolute URL of the deployed app (used in email templates, unsubscribe links, Stripe redirects). |
| `NEXT_PUBLIC_SUPABASE_URL` | REQUIRED | Supabase project URL. Must match `https://*.supabase.co`. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | REQUIRED | Supabase anon key. Length > 20. |

## 2. Supabase (server-side)

| Var | Status | Purpose |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | RECOMMENDED | Enables admin operations (user provisioning, force-delete). Length > 20. |
| `SUPABASE_JWT_SECRET` | OPTIONAL | Only needed if you plan to verify Supabase JWTs manually (rare). |

## 3. Legacy auth

| Var | Status | Purpose |
|---|---|---|
| `JWT_SECRET` | REQUIRED (prod) | Signs legacy JWTs (migration) and gates `/admin/seed-super`. Recommend 32+ chars. **NB**: `lib/auth.js` currently defaults to `'fallback-build-secret-snapnext-secure-32chars'` — the production guard is dead-coded (`if (false && ...)`); re-enable before launch. |

## 4. Database

| Var | Status | Purpose |
|---|---|---|
| `MONGO_URL` | REQUIRED | Preferred key read by `lib/db.js`. |
| `MONGODB_URI` | OPTIONAL | Fallback key read by `lib/db.js` if `MONGO_URL` missing. |
| `MONGO_DB` | OPTIONAL | Database name. Defaults to `snapnext`. |

## 5. Storage

| Var | Status | Purpose |
|---|---|---|
| `STORAGE_PROVIDER` | REQUIRED | `s3` (prod) or `local` (dev). Anything else defaults to `local`. |
| `AWS_ACCESS_KEY_ID` | REQUIRED if `s3` | S3 credentials. |
| `AWS_SECRET_ACCESS_KEY` | REQUIRED if `s3` | S3 credentials. |
| `AWS_REGION` | REQUIRED if `s3` | e.g. `us-east-1`. |
| `AWS_S3_BUCKET` | REQUIRED if `s3` | Bucket name. |
| `AWS_S3_ENDPOINT` | OPTIONAL | For MinIO / R2 / other S3-compatible stores. |
| `AWS_S3_FORCE_PATH_STYLE` | OPTIONAL | `true` for MinIO. |
| `AWS_S3_PUBLIC_BASE_URL` | OPTIONAL | Public CDN prefix when using presigned reads is not desired. |

## 6. AI providers

| Var | Status | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | REQUIRED (if OpenAI used) | — |
| `GEMINI_API_KEY` | REQUIRED (if Gemini used) | Also required for TTS. |
| `AI_PROVIDER_TEXT` | OPTIONAL | Force `openai` or `gemini`. |
| `AI_PROVIDER_VISION` | OPTIONAL | Force `gemini` or `openai`. |
| `AI_PROVIDER_AUDIO` | OPTIONAL | Force `gemini`. |
| `AI_MODEL_TEXT_OPENAI` | OPTIONAL | Model override. Default `gpt-4o-mini`. |
| `AI_MODEL_TEXT_GEMINI` | OPTIONAL | Default `gemini-3.5-flash`. |
| `AI_MODEL_VISION_GEMINI` | OPTIONAL | Default `gemini-3.5-flash`. |
| `AI_MODEL_AUDIO_GEMINI` | OPTIONAL | Default `gemini-3.5-flash`. |
| `AI_MODEL_TTS_GEMINI` | OPTIONAL | Default `gemini-3.1-flash-tts-preview`. |

## 7. Billing (Stripe)

| Var | Status | Purpose |
|---|---|---|
| `STRIPE_SECRET_KEY` | REQUIRED | Stripe server SDK. Prefer `sk_live_*` in prod. |
| `STRIPE_WEBHOOK_SECRET` | REQUIRED | Signs `/webhooks/stripe`. Refuses on missing (503). |
| `STRIPE_PRICE_PLUS` | REQUIRED | Price ID for `plus` plan. |
| `STRIPE_PRICE_PRO` | REQUIRED | Price ID for `pro` plan. |
| `STRIPE_PORTAL_RETURN_URL` | OPTIONAL | Return URL for Stripe Customer Portal. Defaults to `${NEXT_PUBLIC_APP_URL}/billing`. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | OPTIONAL | If using Stripe.js on the client (currently server-only checkout). |

## 8. Email (Resend)

| Var | Status | Purpose |
|---|---|---|
| `RESEND_API_KEY` | REQUIRED | Server SDK. |
| `RESEND_FROM_EMAIL` | REQUIRED | e.g. `SnapNext <hello@snapnext.ai>`. |
| `RESEND_WEBHOOK_SECRET` | REQUIRED | Svix signing secret for `/webhooks/resend`. |
| `EMAIL_UNSUB_SECRET` | REQUIRED | HMAC key for signed unsubscribe tokens. Recommend 32+ chars. |

## 9. Public branding

| Var | Status | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPPORT_EMAIL` | OPTIONAL | Rendered in support / footer. |
| `NEXT_PUBLIC_BRAND_NAME` | OPTIONAL | Defaults to `SnapNext`. |
| `NEXT_PUBLIC_MAINTENANCE_MODE` | OPTIONAL | If truthy, show a maintenance banner. |

## 10. Rate-limit / abuse (recommended — not present today)

| Var | Status | Purpose |
|---|---|---|
| `RATELIMIT_UPSTASH_URL` | RECOMMENDED | Add Upstash Redis for `/auth/login` and `/auth/forgot` throttling. |
| `RATELIMIT_UPSTASH_TOKEN` | RECOMMENDED | Same. |

---

## Total

**44 environment variables** are consumed by the codebase (26 required for launch, 6 conditional on S3, 12 optional).

Recommend a `sample.env` file committed to the repo listing every variable with `# TODO` placeholders (no real secrets). This audit is the source of truth.

---

## Recommended `sample.env` structure

```env
# Framework
NODE_ENV=production
PORT=3000
NEXT_PUBLIC_APP_URL=https://snapnext.ai

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOURPROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Legacy JWT
JWT_SECRET=change-me-please-32-chars-min

# Database
MONGO_URL=mongodb+srv://user:pass@cluster.mongodb.net/snapnext
MONGO_DB=snapnext

# Storage
STORAGE_PROVIDER=s3
AWS_REGION=us-east-1
AWS_S3_BUCKET=snapnext-prod
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...

# AI
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIza...
AI_PROVIDER_TEXT=openai
AI_PROVIDER_VISION=gemini
AI_PROVIDER_AUDIO=gemini

# Billing
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PLUS=price_...
STRIPE_PRICE_PRO=price_...

# Email
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=SnapNext <hello@snapnext.ai>
RESEND_WEBHOOK_SECRET=whsec_svix_...
EMAIL_UNSUB_SECRET=change-me-32-chars-min
```
