# MANUAL_APPLY_GUIDE.md — How to Apply This Package to Your Repo

This guide walks the repo owner through applying the seven modified files from `MODIFIED_FILES/` into the real `vipinlamba1985/vipinlamba1985-snapnext` repo, followed by the recommended verification pass.

---

## 0. Prerequisites

- A local clone of your GitHub repo (`git clone git@github.com:vipinlamba1985/vipinlamba1985-snapnext.git`).
- Yarn Berry (the repo's pinned package manager). `yarn --version` should be `1.22.22` or higher.
- Node 18+.
- Access to a staging environment with all 44 environment variables set (see `ENV_REQUIRED.md`).

---

## 1. Create a new feature branch

```bash
cd path/to/vipinlamba1985-snapnext
git checkout main
git pull --ff-only
git checkout -b launch-safety-audit-fixes
```

---

## 2. Copy the seven modified files

Unzip `SNAPNEXT_LAUNCH_SAFETY_AUDIT_PACKAGE.zip` next to your clone. Copy each file from `MODIFIED_FILES/` into the matching location in the repo:

```bash
cp SNAPNEXT_LAUNCH_SAFETY_AUDIT_PACKAGE/MODIFIED_FILES/middleware.js \
   path/to/vipinlamba1985-snapnext/middleware.js

cp SNAPNEXT_LAUNCH_SAFETY_AUDIT_PACKAGE/MODIFIED_FILES/lib/auth.js \
   path/to/vipinlamba1985-snapnext/lib/auth.js

cp SNAPNEXT_LAUNCH_SAFETY_AUDIT_PACKAGE/MODIFIED_FILES/lib/gemini.js \
   path/to/vipinlamba1985-snapnext/lib/gemini.js

cp "SNAPNEXT_LAUNCH_SAFETY_AUDIT_PACKAGE/MODIFIED_FILES/app/(app)/journal/page.js" \
   "path/to/vipinlamba1985-snapnext/app/(app)/journal/page.js"

cp "SNAPNEXT_LAUNCH_SAFETY_AUDIT_PACKAGE/MODIFIED_FILES/app/(app)/memories/page.js" \
   "path/to/vipinlamba1985-snapnext/app/(app)/memories/page.js"

cp "SNAPNEXT_LAUNCH_SAFETY_AUDIT_PACKAGE/MODIFIED_FILES/app/api/[[...path]]/route.js" \
   "path/to/vipinlamba1985-snapnext/app/api/[[...path]]/route.js"

cp SNAPNEXT_LAUNCH_SAFETY_AUDIT_PACKAGE/MODIFIED_FILES/app/demo-login/page.js \
   path/to/vipinlamba1985-snapnext/app/demo-login/page.js
```

---

## 3. Review the diff

```bash
cd path/to/vipinlamba1985-snapnext
git status
git diff --stat
```

You should see exactly seven modified files. If you see more or fewer, stop and reconcile.

```bash
git diff middleware.js
git diff lib/auth.js
git diff lib/gemini.js
git diff 'app/(app)/journal/page.js'
git diff 'app/(app)/memories/page.js'
git diff 'app/api/[[...path]]/route.js'
git diff app/demo-login/page.js
```

Cross-check every hunk against `CHANGED_FILES.md` to make sure the semantic changes match your expectation.

---

## 4. Local static verification

```bash
yarn install --immutable
yarn lint
```

Expected: no new ESLint errors introduced by the seven files. Pre-existing warnings in `app/(app)/memories/page.js` (unescaped apostrophe on ≈line 309, `styled-jsx` warning on ≈line 401) are not from this session and can be ignored or addressed separately.

---

## 5. Build verification (real environment)

On a staging host that has all 44 env vars set (see `ENV_REQUIRED.md`):

```bash
yarn build
NODE_ENV=production node server.js
```

Spot-check the 10 items in `TEST_RESULTS.md` §4.

---

## 6. Confirm the preview-token gate

With `NODE_ENV=production` and the app running:

```bash
curl -i https://your-staging-host/dashboard \
  -H 'Authorization: Bearer preview-demo-token'
```

Expected: HTTP 302 to `/login?next=/dashboard`. If you see 200 with the dashboard HTML, stop — the gate did not apply. Confirm you copied the new `middleware.js` and `lib/auth.js`.

Same check via cookie:

```bash
curl -i https://your-staging-host/dashboard \
  -H 'Cookie: sb-access-token=preview-demo-token'
```

Expected: HTTP 302 to `/login`.

---

## 7. Confirm `/demo-login` in production

Open `https://your-staging-host/demo-login` in an incognito browser. You should see the "Preview mode is not available" screen with a link to `/login`. `localStorage` should remain untouched — verify via DevTools.

---

## 8. Data-truthfulness spot checks

With a fresh user account that has no media uploaded:

1. Navigate to `/journal` — must show the truthful empty state (`Your journal is quiet today`).
2. Navigate to `/memories` — both Monthly Recap and Annual Recap cards must show the empty-state copy from `REFERENCE_VISUAL_POLICY.md`, not any pre-written narrative.
3. Navigate to `/favorites` — no fabricated `relationshipHighlights`.
4. Attempt an audio transcription while blocking the Gemini network — the transcript should be empty with `providerStatus: 'ai_service_unavailable'`, not a fake string.

Upload one photo. Reload each page. Data should now update with **truthful counts and real AI-derived tags** — no `Sarika`, `Vipin`, `Goa`.

---

## 9. Commit

```bash
git add \
  middleware.js \
  lib/auth.js \
  lib/gemini.js \
  'app/(app)/journal/page.js' \
  'app/(app)/memories/page.js' \
  'app/api/[[...path]]/route.js' \
  app/demo-login/page.js

git commit -m "security: gate preview-demo-token to non-production; remove fabricated user data across API, Journal, Memories, Gemini prompts"
```

Recommended commit message body:

```
- middleware.js, lib/auth.js, app/demo-login/page.js: restrict
  preview-demo-token bypass to NODE_ENV != 'production' and
  strip owner PII from the synthesised preview identity.

- app/api/[[...path]]/route.js:
  - /memories/timeline: remove hardcoded 'sarika' classifier
    keyword; replace pre-written monthlyRecap/yearlyRecap
    narratives with truthful count-derived summaries.
  - /favorites/ai: replace unsupported emotional-highlight claim
    with truthful face-count summary.
  - /ai/audio-transcribe: remove fabricated placeholder text;
    return { transcript, providerStatus }.

- lib/gemini.js: strip owner personal names from analyzeImage
  prompt; replace all fabricated fallbacks (transcribeAudio,
  askMemoryAssistant, mockImageAnalysis, mockVideoAnalysis)
  with structured { providerStatus } markers.

- app/(app)/journal/page.js: read only real /memories/timeline;
  add skeleton + truthful empty state.

- app/(app)/memories/page.js: render truthful empty state when
  recap is empty.

See SNAPNEXT_LAUNCH_SAFETY_AUDIT_PACKAGE/DOCS/CHANGED_FILES.md
for line-level context.
```

---

## 10. Push (when ready)

```bash
git push -u origin launch-safety-audit-fixes
```

Open a PR to `main`. Reviewers should read `CHANGED_FILES.md` and `MISSING_REQUIREMENTS.md` before approving.

> **Reminder from user instruction:** do not push to `main` directly. Open a PR.

---

## 11. Follow-up work

See `MISSING_REQUIREMENTS.md` §1.15–1.18 for the remaining fabricated-data blockers that must be closed in Session 2 before public launch.

See `IMPLEMENTATION_NOTES.md` § Session 2–5 for the full follow-up roadmap.
