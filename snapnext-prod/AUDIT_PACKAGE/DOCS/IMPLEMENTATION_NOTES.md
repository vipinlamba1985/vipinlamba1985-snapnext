# IMPLEMENTATION_NOTES.md — What Was Fixed, How, and What Is Left

---

## Session 1 (this session) — Launch Safety Audit

### Objective
Apply surgical launch-blocker fixes on the real Next.js `main` branch (cloned locally to `/app/snapnext-prod/repo`) without rewriting the app. Produce an exhaustive audit package.

### Fixes applied
See `CHANGED_FILES.md` for the exhaustive list. Summary:
1. `middleware.js` — `preview-demo-token` bypass gated to `NODE_ENV !== 'production'`.
2. `lib/auth.js` — same gate server-side; owner PII stripped from the synthesised preview user identity.
3. `app/demo-login/page.js` — entire bootstrap gated to non-prod; production renders "not available" screen.
4. `app/api/[[...path]]/route.js` — `/memories/timeline` no longer hardcodes `'sarika'`; recaps are truthful count-derived strings; `/favorites/ai` `relationshipHighlights` truthful; `/ai/audio-transcribe` no fake fallback text.
5. `lib/gemini.js` — all fabricated content in prompts and fallbacks removed; wrappers return `providerStatus` markers.
6. `app/(app)/memories/page.js` — recap cards render truthful empty state when API returns empty recaps.
7. `app/(app)/journal/page.js` — (already committed at start of session) reads only real data via `/memories/timeline`, adds skeleton + truthful empty state.

### Verification
- ESLint pass on every modified file (`middleware.js`, `lib/auth.js`, `lib/gemini.js`, `app/api/[[...path]]/route.js`, `app/(app)/journal/page.js`, `app/(app)/memories/page.js`, `app/demo-login/page.js`). Zero new issues.
- Grep confirms `'sarika'`, `'Vipin Lamba'`, and `'vipin.lamba1985'` no longer appear in the six modified files.
- Full `next build` NOT run locally — the environment lacks all 44 required env vars; `TEST_RESULTS.md` explains what verification is possible on a real target.

### Explicit non-goals for this session
- No GitHub push, no PR, no merge.
- No full UI/UX rewrite of the app.
- No new features, no design overhaul.

---

## Session 2 (next — mandatory before public launch)

### 2A. Close the remaining fabricated-personal-data blockers (P0)

**Files:** `lib/api-client.js`, `app/(app)/dashboard/page.js`, `app/(app)/chat/page.js`, `app/(app)/life-graph/page.js`.

**Concrete steps:**
1. `lib/api-client.js`
   - Replace `previewUser.name = 'Vipin Lamba'` → `'Preview Reviewer'`.
   - Replace `previewUser.email = 'vipin.lamba1985@gmail.com'` → `'preview@snapnext.local'`.
   - Replace `previewMedia[]` with an empty array or three purely abstract items.
   - Gate the entire `PREVIEW_TOKEN` branch behind `process.env.NEXT_PUBLIC_ENABLE_PREVIEW === '1'` (default off).
   - Replace insight strings in `previewResponse()` with `null`/empty.
2. `app/(app)/dashboard/page.js`
   - Replace `searchSuggestions = ['Beach photos', 'Sarika', 'Dubai', 'Birthday', 'Goa', 'Family trip', 'Wedding']` with a neutral list `['Beach', 'Birthday', 'Family', 'Travel', 'Wedding', 'Food', 'Pets']`.
   - Replace input placeholders (`"Ask your memory: beach photos, Sarika, Dubai trip..."`, `"Tags (comma-separated, e.g. sarika, rain, sunset)"`, `"Prompt (e.g. Rainy coffee morning with Sarika lamba)"`) with neutral copy.
   - Remove the four `localStorage.getItem('snapnext_token') === 'preview-demo-token'` early-return branches, since the server rejects the token in prod.
   - Replace hardcoded AI story / caption fallback strings (see MISSING_REQUIREMENTS.md §1.19–1.20) with the copy from `REFERENCE_VISUAL_POLICY.md`.
3. `app/(app)/chat/page.js`
   - Replace `"Beach pictures with Sarika"` (line 294) with `"Beach pictures from last summer"`.
4. `app/(app)/life-graph/page.js`
   - Delete all inline mock nodes (`Sarika`, `Sarika lamba`, `Sarika (Partner)`, `Mom`, `Dad`, etc.).
   - Wire the page to `/api/favorites/ai` (already truthful post-fix) and `/api/memories/timeline`.
   - Render an empty state per `REFERENCE_VISUAL_POLICY.md` §1 (Life Graph) until real data arrives.

### 2B. Re-enable JWT_SECRET production guard (P0)

In `lib/auth.js`, find the `if (false && …)` production guard and re-enable it:

```js
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}
```

### 2C. Rate-limit sensitive auth endpoints (P0)

Add Upstash or in-memory rate limiter to `/auth/login` and `/auth/forgot`. Recommend Upstash so limits survive server restarts.

### 2D. CORS tightening + CSP (P1)

- Update `cors(res)` to set `Access-Control-Allow-Origin: process.env.NEXT_PUBLIC_APP_URL` (not `*`).
- Add CSP headers in `next.config.js`.

---

## Session 3 — UX unification (align UI to the polished prototype)

Use `SNAPNEXT_UX_IMPLEMENTATION_BRIEF.md` (already delivered in an earlier session) as the specification. Bring the following pages in line with the prototype:

1. Upload / Backup complete UX and wiring.
2. Memories complete UX and data wiring.
3. SnapNext AI unification over existing architecture.
4. Home daily command center.
5. Gallery and media detail.
6. Favorites and sharing permissions.

---

## Session 4 — Backend refactor

Split `app/api/[[...path]]/route.js` into `app/api/_handlers/{auth,media,memories,ai,favorites,shared,billing,exports,insights,admin,webhooks}.js`, dispatched by prefix. This unlocks unit tests per handler.

---

## Session 5 — Performance & operations

- Move upload-time AI analysis into a background worker.
- Add MongoDB TTL / composite indexes listed in `ARCHITECTURE_AUDIT.md` §6.
- Add structured logging + `x-request-id` propagation.
- Add `/api/ai/health` and `/api/health/db`.

---

## Conventions established during this session

1. **Zero fabrication rule.** Server code never returns invented narratives. Falsy content is returned as empty string, null, or an empty array with `providerStatus`. UI is responsible for rendering an honest empty state.
2. **Prompt hygiene.** No prompts embed personal names or place names from the repo owner. Prompts explicitly forbid fabrication.
3. **Preview-token discipline.** Every gate that trusts the preview token now checks `NODE_ENV !== 'production'`.
4. **Comment style.** Multi-line `// ---` fenced comments precede every security-sensitive block.
5. **Documentation.** Every launch blocker fix is recorded in `CHANGED_FILES.md` with rationale.

---

## Files touched in this session

1. `middleware.js`
2. `lib/auth.js`
3. `lib/gemini.js`
4. `app/api/[[...path]]/route.js`
5. `app/(app)/journal/page.js`
6. `app/(app)/memories/page.js`
7. `app/demo-login/page.js`

No other files were modified. `git diff` on the repo will show only these seven files.
