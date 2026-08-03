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
| `JWT_SECRET` | REQUIRED FOR PRODUCTION | Legacy session validation. MUST be a random string of 32+ chars. In production, a missing/weak value disables the legacy token path entirely. | Hosting env |
| `CRON_SECRET` | REQUIRED FOR PRODUCTION | Authorizes Google Drive continuation and automatic Trash purge jobs. | Hosting env |
| `TRASH_RETENTION_DAYS` | OPTIONAL (default `30`) | Days before trashed media is permanently removed. Bounded to 1–365 and shown in the Trash UI. | Hosting env |
| `TRASH_PURGE_BATCH_SIZE` | OPTIONAL (default `100`) | Maximum expired Trash records processed per cron run. Bounded to 1–500. | Hosting env |

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
| `GEMINI_API_KEY` | REQUIRED FOR FEATURE (vision/upload analysis, transcription, memory assistant) | Direct Google Gemini API. Without it, upload analysis returns an honest unavailable state and transcription returns a structured error. |
| `OPENAI_API_KEY` | REQUIRED FOR FEATURE (captions, chat, stories, journal narrative) | Direct OpenAI API in production. |
| `OPENAI_BASE_URL` | DEVELOPMENT ONLY | Points the OpenAI SDK at an OpenAI-compatible gateway. REMOVE in production. |
| `GEMINI_GATEWAY_MODEL` | DEVELOPMENT ONLY | Gemini model name when routed via gateway. |
| `OPENAI_TEXT_MODEL` | OPTIONAL | Text model override. |
| `AI_PROVIDER_PRIMARY` / `AI_PROVIDER_VISION` / `AI_PROVIDER_FALLBACK` | OPTIONAL | Provider routing. |

## Circles social connections

Circles supports manual `@profile` organization without any social credentials. Automatic following/subscription import is only enabled for connectors with legitimate API access.

| Variable | Classification | Purpose |
|---|---|---|
| `YOUTUBE_CLIENT_ID` | REQUIRED FOR FEATURE | Google OAuth client ID for read-only YouTube subscription access. |
| `YOUTUBE_CLIENT_SECRET` | REQUIRED FOR FEATURE | Google OAuth client secret. Server-side only. |
| `CIRCLES_TOKEN_ENCRYPTION_KEY` | REQUIRED FOR FEATURE | Encrypts OAuth access/refresh tokens at rest. |

Authorize: `https://<your-domain>/api/circles/connections/youtube/callback`

## Smart Sync providers

| Variable | Classification | Purpose |
|---|---|---|
| `GOOGLE_DRIVE_CLIENT_ID` / `GOOGLE_DRIVE_CLIENT_SECRET` | REQUIRED FOR FEATURE | Google Drive read-only Smart Sync. |
| `GOOGLE_PHOTOS_CLIENT_ID` / `GOOGLE_PHOTOS_CLIENT_SECRET` | REQUIRED FOR FEATURE | Google Photos Picker imports. |
| `DROPBOX_CLIENT_ID` / `DROPBOX_CLIENT_SECRET` | REQUIRED FOR FEATURE | Dropbox read-only Smart Sync. |
| `ONEDRIVE_CLIENT_ID` / `ONEDRIVE_CLIENT_SECRET` | REQUIRED FOR FEATURE | OneDrive read-only Smart Sync. |
| `ONEDRIVE_TENANT_ID` | OPTIONAL (default `common`) | Microsoft tenant for OneDrive OAuth. |
| `CLOUD_CONNECTOR_SECRET` | REQUIRED FOR FEATURE | Encrypts cloud refresh tokens at rest (`lib/cloud-token-crypto.js`) and signs the OAuth state. Required by every provider above. Rotating it makes stored tokens undecryptable, so every user must reconnect. |

## Storage (AWS S3 and persistent local volumes)

Vercel production storage operations fail closed unless `STORAGE_PROVIDER=s3`, preventing its ephemeral filesystem from being treated as durable memory storage. The documented Docker production setup may continue using `STORAGE_PROVIDER=local` because `/app/uploads` is mounted to a persistent volume. Other ephemeral hosts should set `REQUIRE_DURABLE_S3=true`.

| Variable | Classification | Purpose |
|---|---|---|
| `STORAGE_PROVIDER` | REQUIRED ON VERCEL (`s3`) | `s3` on Vercel; `local` is allowed for development or a persistent Docker volume. |
| `REQUIRE_DURABLE_S3` | OPTIONAL SAFETY FLAG | Set `true` on non-Vercel ephemeral production hosts to reject local storage. |
| `AWS_ACCESS_KEY_ID` | REQUIRED WHEN USING S3 | S3 credentials |
| `AWS_SECRET_ACCESS_KEY` | REQUIRED WHEN USING S3 | S3 credentials |
| `AWS_REGION` | REQUIRED WHEN USING S3 | S3 bucket region |
| `AWS_S3_BUCKET` | REQUIRED WHEN USING S3 | Bucket name |
| `S3_SIGNED_URL_TTL` | OPTIONAL | Signed URL expiry in seconds |
| `MAX_UPLOAD_SIZE_MB` | OPTIONAL | Per-file upload cap |
| `UPLOAD_DIR` | OPTIONAL FOR LOCAL STORAGE | Local/persistent-volume storage directory |

## Billing (Stripe web + native boundary)

Mock billing refuses production. Stripe checkout is available on the web only. Capacitor iOS/Android builds intentionally hide checkout, portal links and paid-plan purchase controls until StoreKit/Google Play Billing is implemented.

SnapNext supports two Stripe pricing modes:
1. **Configured Price mode** — set Stripe Price IDs and reuse products/prices created in Stripe.
2. **Inline recurring-price mode** — when a Price ID is absent, Checkout creates recurring `price_data` from the authoritative amounts in `lib/plans.js`. Plan, interval, and user identity remain attached through Checkout and subscription metadata for webhook reconciliation.

| Variable | Classification | Purpose |
|---|---|---|
| `BILLING_PROVIDER` | REQUIRED FOR WEB PRODUCTION (`stripe`) | `mock` is development-only. |
| `STRIPE_SECRET_KEY` | REQUIRED FOR WEB PRODUCTION | Creates customers, subscriptions, Checkout and portal sessions. |
| `STRIPE_WEBHOOK_SECRET` | REQUIRED FOR WEB PRODUCTION | Verifies webhook signatures before changing entitlements. |
| `STRIPE_CURRENCY` | OPTIONAL (default `usd`) | Three-letter currency used by inline recurring-price Checkout. |
| `STRIPE_PRICE_STARTER_YEARLY` | OPTIONAL | Reuse a pre-created Starter Stripe Price instead of inline pricing. Starter is sold yearly only, so there is no monthly price to configure. |
| `STRIPE_PRICE_PLUS_MONTHLY` / `STRIPE_PRICE_PLUS_YEARLY` | OPTIONAL | Reuse pre-created Plus Stripe Prices instead of inline pricing. |
| `STRIPE_PRICE_PRO_MONTHLY` / `STRIPE_PRICE_PRO_YEARLY` | OPTIONAL | Reuse pre-created Pro Stripe Prices instead of inline pricing. |
| `STRIPE_PRICE_FAMILY_MONTHLY` / `STRIPE_PRICE_FAMILY_YEARLY` | OPTIONAL | Reuse pre-created Family Stripe Prices instead of inline pricing. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | OPTIONAL | Client-side Stripe.js if used. Current Checkout redirects are created server-side. |

The source-of-truth launch ladder is Free, Starter $0.99, Plus $3.99, Pro $8.99 and Family $14.99 per month. Updating `lib/plans.js` updates entitlements, Billing, the public plans API and landing pricing. Pre-created Stripe Price IDs are no longer required for checkout, but their amounts should match the source of truth when configured.

## Email (Resend)

| Variable | Classification | Purpose |
|---|---|---|
| `RESEND_API_KEY` | REQUIRED FOR FEATURE | Transactional email API key |
| `RESEND_WEBHOOK_SECRET` | REQUIRED FOR FEATURE | Webhook verification |
| `EMAIL_FROM` / `EMAIL_FROM_NAME` / `EMAIL_PROVIDER` / `SUPPORT_EMAIL` | OPTIONAL | Sender identity and support routing |

## Development-only flags (must NOT be set in production)

| Variable | Notes |
|---|---|
| `OPENAI_BASE_URL` | Gateway routing — remove in production |
| `GEMINI_GATEWAY_MODEL` | Gateway routing — remove in production |
| Preview demo auth | The preview token and `/demo-login` are disabled whenever `NODE_ENV=production` or `VERCEL_ENV=production`. |

## Launch-blocking summary

1. Supabase URL, anon key and service-role key.
2. MongoDB connection.
3. Public base URL.
4. Strong JWT secret for the legacy migration path.
5. On Vercel: `STORAGE_PROVIDER=s3` plus all AWS values. Persistent Docker local storage remains supported.
6. `CRON_SECRET`; automatic Trash deletion and Smart Sync continuation depend on it.
7. `BILLING_PROVIDER=stripe`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and a valid public app/base URL for web subscriptions. Stripe Price IDs are optional because inline recurring pricing is available.
8. Gemini and/or OpenAI keys for the AI features being launched.
9. Provider credentials and token-encryption keys for each enabled Smart Sync/Circles connection.
10. Native apps must continue hiding Stripe purchase controls until platform-native billing is integrated.
