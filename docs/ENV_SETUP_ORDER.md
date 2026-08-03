# SnapNext — environment variable setup

Work top to bottom. Each group is useless until the group above it is done.

## Where these go

**Vercel → your project → Settings → Environment Variables**

For each variable: enter the name, paste the value, tick **Production**,
**Preview** and **Development**, then Save.

Two things people get wrong:

- **Vercel does not apply new variables to a running deployment.** After
  adding them you must go to **Deployments → latest → ⋯ → Redeploy**.
  Nothing changes until you do.
- Anything starting `NEXT_PUBLIC_` is **visible in the browser**. Never put a
  secret key behind that prefix.

---

## GROUP 1 — Nobody can log in without these

The app runs but no account can sign up or sign in. Do these first.

| Variable | Where to get it |
|---|---|
| `SUPABASE_URL` | supabase.com → your project → Settings → API → **Project URL**. Looks like `https://abcd1234.supabase.co`. Do **not** include `/rest/v1`. |
| `SUPABASE_ANON_KEY` | Same page → **anon / public** key |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page → **service_role** key. Secret — server only, never `NEXT_PUBLIC_` |
| `MONGO_URL` | cloud.mongodb.com → Cluster → **Connect** → Drivers → copy the string. Replace `<password>`. Add `0.0.0.0/0` under Network Access or Vercel cannot reach it |
| `NEXT_PUBLIC_BASE_URL` | Your own domain, e.g. `https://snapnext.ai`. No trailing slash |
| `JWT_SECRET` | Generate: `openssl rand -base64 32` |
| `CRON_SECRET` | Generate: `openssl rand -base64 32` |

**Test:** sign up with a new email. If that works, Group 1 is done.

---

## GROUP 2 — Nobody can upload without these

Vercel's disk is temporary, so the app **refuses** local storage in
production rather than pretending photos are saved. Uploads fail until this
is set.

| Variable | Where to get it |
|---|---|
| `STORAGE_PROVIDER` | Type `s3` |
| `AWS_S3_BUCKET` | AWS Console → S3 → Create bucket → use the **name** you chose |
| `AWS_REGION` | The bucket's region, e.g. `us-east-1` |
| `AWS_ACCESS_KEY_ID` | AWS → IAM → Users → Create user → Security credentials → Create access key |
| `AWS_SECRET_ACCESS_KEY` | Shown **once** when you create the key. Save it immediately |

Give the IAM user `AmazonS3FullAccess`, or a policy limited to your bucket.

**Test:** upload a photo, reload the Library, confirm it is still there.

---

## GROUP 3 — Take money

| Variable | Where to get it |
|---|---|
| `BILLING_PROVIDER` | Type `stripe` |
| `STRIPE_SECRET_KEY` | dashboard.stripe.com → Developers → API keys → **Secret key**. Use `sk_test_…` while testing |
| `STRIPE_WEBHOOK_SECRET` | Developers → Webhooks → Add endpoint → `https://your-domain/api/webhooks/stripe` → copy the **Signing secret** (`whsec_…`) |

You do **not** need Stripe Price IDs. Prices come from `lib/plans.js`
automatically. If you create them in Stripe anyway, the amounts must match.

**Test:** upgrade to Plus with card `4242 4242 4242 4242`, any future expiry.

---

## GROUP 4 — The AI features

Everything above works without these; AI features show honest "unavailable"
messages instead of breaking.

| Variable | Where to get it | Gives you |
|---|---|---|
| `GEMINI_API_KEY` | aistudio.google.com/apikey | Photo analysis — captions, tags, places. **Start here:** search quality depends on it |
| `OPENAI_API_KEY` | platform.openai.com/api-keys | Chat, stories, captions **and smart search** |
| `SMART_SEARCH_ENABLED` | Leave empty (on) or `false` to force off | Search by meaning |

**Set a spending limit** in both consoles before you paste the key anywhere.

---

## GROUP 5 — Cloud imports (one per provider you want)

Each provider works on its own — set only the ones you want. Every callback
URL below must be registered with that provider exactly.

| Variable | Where to get it |
|---|---|
| `CLOUD_CONNECTOR_SECRET` | `openssl rand -base64 32`. **Required for any provider below** — it encrypts stored refresh tokens and signs the OAuth state |
| `GOOGLE_DRIVE_CLIENT_ID` / `_SECRET` | console.cloud.google.com → APIs & Services → Credentials → OAuth client ID → Web application |
| `GOOGLE_PHOTOS_CLIENT_ID` / `_SECRET` | Same place, separate client |
| `DROPBOX_CLIENT_ID` / `_SECRET` | dropbox.com/developers/apps → Create app → Scoped access |
| `ONEDRIVE_CLIENT_ID` / `_SECRET` | portal.azure.com → App registrations → New registration |

Callback URLs to register:

```
https://your-domain/api/cloud/google-drive/callback
https://your-domain/api/smart-sync/oauth/google_photos/callback
https://your-domain/api/smart-sync/oauth/dropbox/callback
https://your-domain/api/smart-sync/oauth/onedrive/callback
```

**Test:** Add → "Add from a cloud". A configured provider stops saying
"Not set up".

---

## GROUP 6 — Nice to have

| Variable | Where to get it | For |
|---|---|---|
| `RESEND_API_KEY` | resend.com → API Keys | Password reset and verification email |
| `EMAIL_FROM` | e.g. `hello@your-domain` | Sender address |
| `AI_INDEX_ENABLED` | Type `true` | Turns smart search on for everyone |
| `DB_NAME` | Defaults to `snapnext` | Only if you want a different name |
| `TRASH_RETENTION_DAYS` | Defaults to `30` | Days before Trash empties |

---

## Must NOT be set in production

| Variable | Why |
|---|---|
| `OPENAI_BASE_URL` | Development gateway routing. Breaks production AI |
| `GEMINI_GATEWAY_MODEL` | Same |

---

## Minimum to have a working live app

Groups **1 + 2** — eleven variables. Sign-up works, uploads work, photos
persist. Everything else degrades honestly rather than breaking.

## After AWS is set

Run the storage lifecycle policy once — it cuts your largest bill by ~58%:

```bash
npm run storage:lifecycle:dry   # prints the policy, changes nothing
npm run storage:lifecycle       # applies it
```

Check the dry-run output matches your real bucket layout first. It assumes
keys under `originals/` and `thumbs/`; if yours differ, set
`S3_ORIGINALS_PREFIX` and `S3_DERIVATIVES_PREFIX` or the rules match nothing.
