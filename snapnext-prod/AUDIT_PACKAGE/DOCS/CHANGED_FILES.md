# CHANGED_FILES.md — SnapNext Launch Safety Audit Package

Complete list of every file this session modified in the real Next.js repository (relative to `snapnext-prod/repo/`). All edits are surgical — no full-file rewrites.

---

## 1. `middleware.js`

**What changed:** The `preview-demo-token` bypass is now gated on `process.env.NODE_ENV !== 'production'` with an explicit multi-line security comment above it.

**Why:** Previously, any request with `Authorization: Bearer preview-demo-token` or `Cookie: sb-access-token=preview-demo-token` bypassed the entire middleware auth check in every environment, including production. That is a critical impersonation vulnerability.

**Behaviour in production:** the bypass is skipped, and the request falls through to Supabase token validation like any other token. Legitimate Supabase sessions continue to work identically.

**Behaviour in dev / preview / test:** unchanged — reviewers can still hit protected routes via the preview token.

---

## 2. `lib/auth.js` — `getUserFromRequest()`

**What changed:**
- The `preview-demo-token` server-side branch is now gated on `process.env.NODE_ENV !== 'production'`.
- The synthesised preview user identity no longer contains the repo owner's real name (`Vipin Lamba`) or email (`vipin.lamba1985@gmail.com`). It is now a generic `Preview Reviewer` / `preview@snapnext.local`.

**Why:** Even with the middleware fix, this second gate is required. Any endpoint calling `getUserFromRequest()` directly (not passing through middleware) would still have honoured the preview token and impersonated the shadow super-user. Owner PII was leaking to every reviewer/tester who touched the preview flow.

**Downstream impact:** none in production. In dev/preview, the reviewer sees generic identity strings instead of the owner's real identity, which is what should have been there from day one.

---

## 3. `app/demo-login/page.js`

**What changed:**
- The entire client-side bootstrap (which writes `preview-demo-token` into `localStorage`) is now guarded by `process.env.NODE_ENV !== 'production'`.
- In production, the page renders a plain "Preview mode is not available" screen with a CTA to `/login`. It never touches `localStorage` and never navigates the user into the authenticated shell.
- The synthesised demo user object no longer contains the owner's real name or email — same generic identity as `lib/auth.js`.

**Why:** This route was a fourth attack surface. Even if middleware and `lib/auth.js` reject the token server-side, visiting `/demo-login` in production still persists an app-level demo identity in the browser and drops the reviewer into `/dashboard` where the client optimistically renders preview UI states. Gating the entire bootstrap closes that surface.

---

## 4. `app/api/[[...path]]/route.js` — `/memories/timeline` (relationship classifier)

**What changed:** removed the hardcoded personal name `'sarika'` from the relationship keyword array. Only generic role tokens remain (`couple`, `wife`, `husband`, `partner`, `marriage`, `wedding`).

**Why:** `'sarika'` is the repo owner's spouse's name. Its presence meant every user's photos would be classified into the "relationship" timeline based on the owner's family — leaking owner PII into every account's AI classification logic.

---

## 5. `app/api/[[...path]]/route.js` — `/memories/timeline` (monthlyRecap / yearlyRecap)

**What changed:** the pre-written narrative strings (`"In the past month, you captured … Reflecting on joyful and serene moments."` / `"Year 2026 was defined by travel landmarks, heartwarming family gatherings, and beautiful life highlights. SnapNext has archived and indexed your digital legacy perfectly."`) have been replaced with truthful, count-derived summaries built from real `db.collection('media')` results. If the count is zero the recap is an empty string; the UI renders an honest empty state.

**Why:** those narrative strings were fabricated marketing copy served as if they were AI-generated life summaries. Under SnapNext's zero-fabrication rule that is a hard launch blocker.

---

## 6. `app/api/[[...path]]/route.js` — `/favorites/ai` (`relationshipHighlights`)

**What changed:** the fabricated line `"You share the most emotional, joyful moments with X, Y, Z."` has been replaced with a factual count string derived from the real face-tag database (`"N recognised people across M face signals in your memories."`). Suggestions are also count-derived.

**Why:** that emotional claim wasn't supported by any underlying signal in the data — the server has no idea whether moments with X are "emotional" or "joyful". Same zero-fabrication rule.

---

## 7. `app/api/[[...path]]/route.js` — `/ai/audio-transcribe`

**What changed:** the fabricated default `let text = "This is a clean transcript of your family recording memo.";` has been replaced with an empty transcript plus an explicit `providerStatus` marker (`ok` | `ai_service_unavailable` | `ai_provider_failed`). Callers can render an honest "transcript unavailable" state.

**Why:** if the transcription provider was unreachable, users saw the same fake string presented as if it were the actual transcription of their audio. That is not an acceptable fallback.

---

## 8. `lib/gemini.js` — `analyzeImage` prompt

**What changed:** the example-face list embedded in the prompt no longer contains the owner's family names (`"Sarika"`, `"Vipin"`). The prompt now instructs Gemini to use generic role labels only and explicitly forbids inventing or outputting personal names.

**Why:** LLM prompts strongly bias the model's outputs. Every AI face detection across every user's uploads was being anchored to two specific personal names, so the model would frequently emit those names even for unrelated faces.

---

## 9. `lib/gemini.js` — `analyzeImage` default description

**What changed:** the fabricated fallback `description: "A beautiful captured memory."` used when Gemini returns an empty description is now `null` with `providerStatus: 'ok'`. UI code should render an empty state, not a canned description.

---

## 10. `lib/gemini.js` — `transcribeAudio` fallbacks

**What changed:** both fabricated fallback strings (`"This is a simulated audio transcription of your voice memo."` and `"This is a fallback transcription of your family voice note."`) are replaced with a structured `{ providerStatus, text: '' }` return value.

**Why:** those strings were being surfaced to users as though they were the real transcript of their audio.

---

## 11. `lib/gemini.js` — `askMemoryAssistant` prompt & fallbacks

**What changed:**
- Example JSON in the prompt no longer mentions `Sarika`.
- Off-key fallback strings (`"…your Goa vacation or birthday highlights again!"`, `"(Simulator mode: configured without a live GEMINI_API_KEY)."`) are replaced with neutral, honest strings.
- New STRICT RULES section added to the prompt: never invent people, relationships, events, dates, places or memories that are not in the provided library context; never use hardcoded personal names; say so honestly if the answer is unknown.

---

## 12. `lib/gemini.js` — `unavailableVideoAnalysis()` and `mockVideoAnalysis` alias

**What changed:** the old `mockVideoAnalysis` function fabricated cinematic-sounding chapters (`"Exciting Beginning"`, `"Closing Celebration"`), a fake highlight-reel prompt, and forced every video into the `"Family"` auto-album. It has been replaced with an honest `unavailableVideoAnalysis()` returning `providerStatus: 'ai_service_unavailable'` and empty arrays. A backwards-compat alias `mockVideoAnalysis = unavailableVideoAnalysis` is retained so internal callers don't break.

---

## 13. `lib/gemini.js` — `mockImageAnalysis()`

**What changed:** the old function fabricated a full analysis with hardcoded tags (`"family"`, `"memories"`, `"joyful"`), the owner's family names in `faces` (`"User"`, `"Sarika"`, `"Mom"`), and the owner's home city in `locations` (`"Goa"`, `"Home"`). It is now an alias for `unavailableImageAnalysis()`.

---

## 14. `app/(app)/journal/page.js`

**What changed:** already rewritten earlier in this session. The prior version rendered hardcoded fake user data (fabricated names, spouses, children, trips, and AI observations). The current version:
- Reads only from `/memories/timeline`.
- Derives day/week/month/year cycle stats purely from the authenticated user's real media.
- Never fabricates people, places, relationships, dates or narratives.
- Adds full skeleton, error and truthful empty states.
- Preserves Supabase auth (uses `apiFetch`).

Full file included in `MODIFIED_FILES/`.

---

## 15. `app/(app)/memories/page.js`

**What changed:** the Monthly Recap and Annual Recap cards no longer render `"{empty string}"` when the API returns an empty recap. They render a truthful empty-state paragraph instead. No other logic changed.

**Why:** cascading requirement from the `/memories/timeline` fix — with fabricated recaps removed at the source, the consumer needs graceful empty-state UI.

---

## Files NOT changed (documented as launch blockers, deferred to next session)

- `lib/api-client.js` — `previewUser` / `previewMedia` / `previewResponse` still contain owner PII (`Vipin Lamba`, `vipin.lamba1985@gmail.com`) and fabricated preview data. **Client-side blocker.**
- `app/(app)/dashboard/page.js` — hardcoded search suggestions (`Sarika`, `Goa`, `Dubai`), four `preview-demo-token` client branches, fabricated AI story fallbacks.
- `app/(app)/chat/page.js` — hardcoded suggestion `"Beach pictures with Sarika"`.
- `app/(app)/life-graph/page.js` — extensive hardcoded family graph containing `Sarika`, `Sarika lamba`, and fabricated memory counts (`"2,345 memories"`, `"15 travel landmarks"`, `"412 beautiful memories with Sarika this year"`, etc.).

These are covered as **P0 launch blockers** in `MISSING_REQUIREMENTS.md`, `IMPLEMENTATION_NOTES.md`, and `MANUAL_APPLY_GUIDE.md` (Session 2 backlog).
