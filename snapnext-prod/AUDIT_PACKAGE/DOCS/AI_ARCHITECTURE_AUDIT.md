# AI_ARCHITECTURE_AUDIT.md — SnapNext AI Layer

Exhaustive audit of every AI code path in the repo, read from `lib/ai-router.js`, `lib/gemini.js`, `lib/ai-os.js`, `lib/ai-agent-governance.js`, `lib/ai-specialist-agents.js`, `lib/ai-learning-engine.js`, `lib/ai-safety-automation.js`, `lib/ai-task-preview.js`, `lib/ai-video-adapters.js`, `app/api/ai-os/*`, `app/api/ai-agent/*`, and the AI handlers inside `app/api/[[...path]]/route.js`.

---

## 1. Two overlapping AI layers exist today

1. **`lib/ai-router.js` — the modern unified router** used by every `/ai/*` endpoint under the monolith router. Features: caption, hashtags, emojis, postIdeas, doAll, story, memorySummary, chat, vision, videoScript, audioTranscribe.
2. **`lib/ai-os.js` + friends — the legacy "AI Operating System"** exposed under `app/api/ai-os/*` and `app/api/ai-agent/*`. Concepts: specialist agents, governance, learning engine, safety automation, task preview, video adapters. This layer predates `ai-router.js`.

**Reality**: only the modern router is on the critical path for shipping product features (upload analysis, memory search, reels, captions). The AI-OS layer is exposed but not exercised from the main UI shell. It should be either promoted (surfaced in the UI as a genuinely new capability) or archived (moved behind a feature flag).

**Recommendation**: for launch, keep AI-OS endpoints reachable but hide their UI entry points behind `super_user` only. Consolidate into `ai-router.js` in a follow-up. Both layers already share `lib/plans.js` → `ai` credit budgets so no billing double-counting.

---

## 2. `lib/ai-router.js` — modern router

### 2.1 Feature catalogue

| Feature key | Credits | Min plan | Provider preference (in order) | Notes |
|---|---:|---|---|---|
| `caption` | 1 | free | OpenAI → Gemini | Uses image bytes if supplied. |
| `hashtags` | 1 | free | OpenAI → Gemini | |
| `emojis` | 1 | free | OpenAI → Gemini | |
| `doAll` | 3 | plus | OpenAI → Gemini | Composite: caption + hashtags + emojis + short SEO summary. |
| `postIdeas` | 2 | plus | OpenAI → Gemini | |
| `memorySummary` | 3 | plus | OpenAI → Gemini | |
| `story` | 3 | plus | OpenAI → Gemini | JSON card array. |
| `chat` | 1 | free | Gemini (memory assistant) | Uses `askMemoryAssistant`. |
| `vision` | 2 | plus | Gemini vision (`analyzeImage`) | Image analysis. |
| `videoScript` | 5 | pro | OpenAI (text plan) | Composed for reels/highlights. |
| `audioTranscribe` | 2 | plus | Gemini audio (`transcribeAudio`) | Now returns `{ providerStatus, text }`. |

Credits enforced against `ai_usage` (per day + per month) with per-plan caps read from `PLANS[plan].ai`. Rate limits enforced per minute via `lib/entitlements.js` `simulateAiCredits` and `runAiTask` internal counter.

### 2.2 Provider selection

Env-driven with graceful degradation:

| Env var | Effect |
|---|---|
| `AI_PROVIDER_TEXT` = `openai` \| `gemini` | Force default text provider. Missing → chooses whichever key is present. |
| `AI_PROVIDER_VISION` = `gemini` \| `openai` | Vision override. |
| `AI_PROVIDER_AUDIO` = `gemini` | Audio override. |
| `OPENAI_API_KEY` | Required if OpenAI used. |
| `GEMINI_API_KEY` | Required if Gemini used. |
| `AI_MODEL_TEXT_OPENAI` / `AI_MODEL_TEXT_GEMINI` / `AI_MODEL_VISION_GEMINI` / `AI_MODEL_AUDIO_GEMINI` / `AI_MODEL_TTS_GEMINI` | Optional model overrides. |

Defaults (as of 2026-07):
- Text OpenAI: `gpt-4o-mini` (upgraded in prompts to `gpt-5.2-mini` alias in §2.4 backlog)
- Text Gemini: `gemini-3.5-flash`
- Vision Gemini: `gemini-3.5-flash` (multimodal)
- Audio Gemini: `gemini-3.5-flash`
- TTS Gemini: `gemini-3.1-flash-tts-preview`

**Backlog**: verify these model IDs against the live Google model catalog at deploy time — IDs drift. Prefer pinning via env-var overrides.

### 2.3 Post-fix truthfulness rules

All Gemini wrappers in `lib/gemini.js` now return a `providerStatus` marker instead of fabricated content:

- `analyzeImage` → `{ providerStatus: 'ok' \| 'ai_service_unavailable' \| 'ai_provider_failed', description, tags, faces, ... }` (description defaults to `null`, not a canned string).
- `analyzeVideo` → `{ providerStatus, summary, chapters, ... }` (empty arrays when unavailable).
- `transcribeAudio` → `{ providerStatus, text }` (empty string when unavailable).
- `askMemoryAssistant` → plain string, with prompt-side STRICT RULES forbidding fabrication of people, relationships, dates, places, or events.

Callers (`/ai/*` handlers) should always inspect `providerStatus` before rendering. Not every UI page does this yet — see `MISSING_REQUIREMENTS.md` §2.

### 2.4 Prompt hygiene rules (established this session)

1. Prompts never contain hardcoded personal names, place names, or event descriptions specific to the repo owner.
2. Face labels are role-based only: `woman`, `man`, `child`, `mom`, `dad`, `couple`.
3. If the model returns an empty or malformed JSON payload, the wrapper returns the unavailable-shape object above — never a fabricated substitute.
4. `askMemoryAssistant` system prompt now includes: "Never invent people, relationships, events, dates, places, or memories that are not present in the provided library context."

### 2.5 Usage recording

- `ai_usage` collection: `{ userId, feature, credits, provider, day: YYYY-MM-DD, month: YYYY-MM, at: Date }`.
- `ai_history` collection: `{ id, userId, feature, provider, input, output, createdAt }`. Soft-delete via `deletedAt`.
- `preflightAiRequest(user, feature, request)` verifies credits/budget BEFORE calling the provider. On failure returns `{ ok: false, reason, needsPlan }`.
- `getAiUsageSummary(user)` – exposes daily + monthly credits used + remaining, keyed by plan cap.

---

## 3. `lib/gemini.js` — direct SDK wrappers (post-fix)

| Export | Purpose | Failure mode |
|---|---|---|
| `analyzeImage({ imageData, mimeType })` | Multimodal analysis for uploads. | Returns `unavailableImageAnalysis()` with `providerStatus`. |
| `analyzeVideo({ name, mimeType })` | Descriptor-only analysis (no bytes). | Returns `unavailableVideoAnalysis(name)`. |
| `transcribeAudio({ buffer, mimeType })` | Voice memo transcription. | Returns `{ providerStatus, text: '' }`. |
| `askMemoryAssistant({ user, query, libraryContext })` | Text-mode memory search agent. | Returns plain neutral string. |
| `generateTextToSpeech({ text, voice })` | TTS via `gemini-3.1-flash-tts-preview`. | Returns `null`. |
| `mockImageAnalysis` / `mockVideoAnalysis` | Kept as **aliases** for `unavailable*` for backwards compat. | Never fabricates. |

---

## 4. Legacy layer — AI OS (`app/api/ai-os/*`) & AI Agent

Each of these has its own `route.js` under `app/api/ai-os/`:

| Sub-route | Guard | Purpose |
|---|---|---|
| `agents/route.js` | user | List available specialist agents (`lib/ai-specialist-agents.js`). |
| `alerts/route.js` | user | Poll safety alerts (`lib/ai-safety-automation.js`). |
| `business/route.js` | user | Business-facing plan output. |
| `certification/route.js` | super | Governance certification (`lib/ai-agent-governance.js`). |
| `feedback/route.js` | user | Capture user feedback into learning engine. |
| `governance/route.js` | super | Governance state (`lib/ai-agent-governance.js`). |
| `preview/route.js` | user | Task preview (`lib/ai-task-preview.js`). |
| `safety/route.js` | user | Safety rules & flags. |
| `scorecards/route.js` | user | Per-agent performance snapshot. |
| `status/route.js` | user | AI-OS heartbeat. |
| `video/route.js` | user | Video adapters (`lib/ai-video-adapters.js`). |

`app/api/ai-agent/route.js` + `app/api/ai-agent/debug/route.js` — the legacy single-endpoint AI Agent. Retained for backwards compatibility but not surfaced in the main app shell today.

**Status**: these are not on the launch critical path but ship with the app. **Recommend**: gate the AI-OS UI (if any) behind `super_user` for the initial launch. The endpoints themselves already use `requireUser` so no unauthenticated exposure exists.

---

## 5. Cross-cutting AI issues found

| # | Severity | Where | Description | Fix status |
|---|---|---|---|---|
| A1 | P0 | `lib/gemini.js` prompt examples | Contained `"Sarika"`, `"Vipin"`, `"Goa"` — biased outputs for every user | ✅ Fixed |
| A2 | P0 | `lib/gemini.js` transcript fallbacks | Fabricated placeholder strings | ✅ Fixed |
| A3 | P0 | `lib/gemini.js` mockImageAnalysis | Hardcoded family/place names | ✅ Fixed (alias to unavailable) |
| A4 | P0 | `lib/gemini.js` mockVideoAnalysis | Fabricated cinematic chapters | ✅ Fixed |
| A5 | P0 | `/ai/audio-transcribe` handler | Default text = fabricated placeholder | ✅ Fixed |
| A6 | P0 | `/memories/timeline` relationship classifier | Hardcoded `'sarika'` keyword | ✅ Fixed |
| A7 | P0 | `/memories/timeline` recaps | Pre-written narratives | ✅ Fixed (count-derived) |
| A8 | P0 | `/favorites/ai` relationshipHighlights | Unsupported emotional claim | ✅ Fixed |
| A9 | P1 | AI usage caps per `super_user` | `PLANS.super_user.ai.dailyCredits = 99999` — effectively unlimited, correct for internal accounts but ensure no non-super account is set to `super_user` in Mongo | Document only |
| A10 | P1 | `analyzeImage` inline during `/media/upload` | AI runs synchronously in the upload request — slows every upload. On failure, media still saves but `aiAnalysis` may be empty | Recommend async job queue (backlog) |
| A11 | P1 | AI history retention | No TTL, no size cap | Recommend TTL index on `ai_history.createdAt` (365 days) |
| A12 | P2 | AI provider health | No `/ai/health` endpoint | Recommend add (backlog) |
| A13 | P2 | Prompt versioning | Prompts are inline strings; no version tag | Move prompts into `lib/prompts/*.js` with `version` constants |

---

## 6. Data flow — image upload example

```
Client (upload/page.js)
  → POST /api/media/upload  (multipart)
     → requireUser → plan quota check → storage.save
     → analyzeImage({ imageData, mimeType })      ← lib/gemini.js
        → GenerativeModel(gemini-3.5-flash).generateContent(...)
        → { providerStatus, description|null, tags[], faces[], ... }
     → db.collection('media').insertOne({ ..., aiAnalysis })
  ← { id, url, aiAnalysis, providerStatus }
```

On provider failure `aiAnalysis.providerStatus` is set to `ai_service_unavailable` and downstream classifiers (timeline, gallery filters, memory recap counts) tolerate the empty structure gracefully.

---

## 7. Cost & quota shape

| Plan | AI credits / day | AI credits / month | Max concurrent AI calls |
|---|---:|---:|---:|
| free | 5 | 50 | 1 |
| plus | 50 | 1000 | 3 |
| pro | 200 | 5000 | 5 |
| super_user | 99999 | 99999 | 20 |

Exact values live in `lib/plans.js`. Adjust before launch based on real per-request Gemini/OpenAI costs.

---

## 8. Recommended follow-up (post-launch, non-blocking)

1. Merge `lib/ai-os.js` + `lib/ai-specialist-agents.js` into `lib/ai-router.js` (single dispatcher).
2. Move prompts to `lib/prompts/*.js` with explicit `version` constants.
3. Add `/ai/health` returning provider heartbeats.
4. Add TTL index on `ai_history.createdAt` (365 days).
5. Move AI analysis on upload into a background worker (BullMQ or Mongo change-stream) so uploads are snappy.
6. Add prompt-injection guard: strip `system:` / `assistant:` role markers from user queries in `askMemoryAssistant`.
