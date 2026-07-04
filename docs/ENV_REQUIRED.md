# SnapNext — Required Environment Variables

Never commit secret values. Configure these in your hosting provider
(e.g. Vercel → Project → Settings → Environment Variables) or in `/app/.env`
for local development. Names only — no values are documented here.

## Classification legend
- **REQUIRED FOR BUILD** — `next build` fails or produces a broken app without it.
- **REQUIRED FOR PRODUCTION** — the app runs but is NOT launchable without it (fail-closed).
- **REQUIRED FOR FEATURE** — a specific feature is unavailable without it (safe JSON errors shown).
- **OPTIONAL** — enhances behavior; safe fallback exists.
- **DEVELOPMENT ONLY** — must NOT be set in production.

## Core runtime

| Variable | Classification | Purpose | Where to configure |
|---|---|---|---|
| `MONGO_URL` (or `MONGODB_URI`) | REQUIRED FOR PRODUCTION | MongoDB connection string. All app data. | Hosting env / MongoDB Atlas |
| `DB_NAME` | OPTIONAL (default `snapnext`) | Mongo database name | Hosting env |
| `NEXT_PUBLIC_BASE_URL` | REQUIRED FOR PRODUCTION | Public app URL (links, redirects, billing return URLs) | Hosting env |
| `NEXT_PUBLIC_APP_URL` | OPTIONAL (falls back to BASE_URL) | Same as above, legacy alias | Hosting env |
| `JWT_SECRET` | REQUIRED FOR PRODUCTION | Legacy session validation + admin seed-super bootstrap. MUST be a random string of 32+ chars. In production, a missing/weak value now DISABLES the legacy token path entirely (fail closed). | Hosting env |

## Authentication (Supabase) — LAUNCH-BLOCKING

Without these, signup/login/password-reset return safe 503 JSON and no user can sign in.

| Variable | Classification | Purpose | Where to obtain |
|---|---|---|---|
| `SUPABASE_URL` | REQUIRED FOR PRODUCTION | Supabase project URL (`https://<ref>.supabase.co`, NOT the `/rest/v1` URL) | Supabase Dashboard → Project Settings → API |
| `SUPABASE_ANON_KEY` | REQUIRED FOR PRODUCTION | Public anon key for auth calls | Supabase Dashboard → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | REQUIRED FOR PRODUCTION | Server-side admin operations (never exposed to browser) | Supabase Dashboard → Project Settings → API |

Accepted aliases: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (URL/anon only).

## AI providers

| Variable | Classification | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | REQUIRED FOR FEATURE (vision/upload analysis, transcription, memory assistant) | Direct Google Gemini API. Without it, upload analysis returns an honest "unavailable" state and transcription returns a structured error — never fabricated output. |
| `OPENAI_API_KEY` | REQUIRED FOR FEATURE (captions, chat, stories, journal narrative) | Direct OpenAI API in production. |
| `OPENAI_BASE_URL` | DEVELOPMENT ONLY | Points the OpenAI SDK at an OpenAI-compatible gateway (Emergent Universal LLM gateway in this workspace). REMOVE in production. |
| `GEMINI_GATEWAY_MODEL` | DEVELOPMENT ONLY | Gemini model name when routed via gateway (default `gemini/gemini-3.5-flash`). |
| `OPENAI_TEXT_MODEL` | OPTIONAL (default `gpt-4o-mini`) | Text model override. |
| `AI_PROVIDER_PRIMARY` / `AI_PROVIDER_VISION` / `AI_PROVIDER_FALLBACK` | OPTIONAL | Provider routing (defaults: openai / gemini / gemini). |

## Storage (AWS S3)

Local disk fallback (`STORAGE_PROVIDER=local`, files under `UPLOAD_DIR` or `/app/uploads`) works for
development, but is NOT durable for production hosting (serverless filesystems are ephemeral).

| Variable | Classification | Purpose |
|---|---|---|
| `STORAGE_PROVIDER` | REQUIRED FOR PRODUCTION (`s3`) | `local` or `s3`. Production should use `s3`. |
| `AWS_ACCESS_KEY_ID` | REQUIRED FOR PRODUCTION | S3 credentials |
| `AWS_SECRET_ACCESS_KEY` | REQUIRED FOR PRODUCTION | S3 credentials |
| `AWS_REGION` | REQUIRED FOR PRODUCTION | S3 bucket region |
| `AWS_S3_BUCKET` | REQUIRED FOR PRODUCTION | Bucket name |
| `S3_SIGNED_URL_TTL` | OPTIONAL | Signed URL expiry (seconds) |
| `MAX_UPLOAD_SIZE_MB` | OPTIONAL | Per-file upload cap |
| `UPLOAD_DIR` | DEVELOPMENT ONLY | Local storage directory |

## Billing (Stripe)

Mock billing REFUSES to run in production (checkout AND portal now throw unless
`BILLING_PROVIDER=stripe` is configured). Webhooks refuse to process without a secret.

| Variable | Classification | Purpose |
|---|---|---|
| `BILLING_PROVIDER` | REQUIRED FOR PRODUCTION (`stripe`) | `mock` (dev only) or `stripe` |
| `STRIPE_SECRET_KEY` | REQUIRED FOR PRODUCTION | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | REQUIRED FOR PRODUCTION | Webhook signature verification (webhooks return 503 without it) |
| `STRIPE_PRICE_PLUS_MONTHLY` / `STRIPE_PRICE_PLUS_YEARLY` | REQUIRED FOR PRODUCTION | Plus plan price IDs |
| `STRIPE_PRICE_PRO_MONTHLY` / `STRIPE_PRICE_PRO_YEARLY` | REQUIRED FOR PRODUCTION | Pro plan price IDs |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | OPTIONAL | Client-side Stripe.js (if used) |

## Email (Resend)

Without these, transactional email (invites, verification-adjacent flows) is
unavailable; the app logs the missing-provider state and continues without
exposing provider errors to users.

| Variable | Classification | Purpose |
|---|---|---|
| `RESEND_API_KEY` | REQUIRED FOR FEATURE (email) | Resend API key |
| `RESEND_WEBHOOK_SECRET` | REQUIRED FOR FEATURE (email events) | Webhook verification |
| `EMAIL_FROM` / `EMAIL_FROM_NAME` / `EMAIL_PROVIDER` / `SUPPORT_EMAIL` | OPTIONAL | Sender identity / support routing |

## Development-only flags (must NOT be set in production)

| Variable | Notes |
|---|---|
| `OPENAI_BASE_URL` | Gateway routing — remove in production |
| `GEMINI_GATEWAY_MODEL` | Gateway routing — remove in production |
| Preview demo auth | Not an env var: the `preview-demo-token` and `/demo-login` page are hard-disabled whenever `NODE_ENV=production` or `VERCEL_ENV=production`. |

## Launch-blocking summary (production)

1. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — no login without them.
2. `MONGO_URL` — no data without it.
3. `NEXT_PUBLIC_BASE_URL` — broken links/billing redirects without it.
4. `JWT_SECRET` (32+ chars) — legacy sessions disabled without it (safe, but set it).
5. `BILLING_PROVIDER=stripe` + Stripe keys + price IDs — paid plans unavailable without them (mock is refused in production).
6. `STORAGE_PROVIDER=s3` + AWS keys — uploads not durable without them.
7. `GEMINI_API_KEY` and/or `OPENAI_API_KEY` — AI features return honest 503s without them.
