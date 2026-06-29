# SnapNext AI OS Layer 1 — Self Review

## Status

Layer 1 is added as a safe orchestration layer on top of the existing dual-provider AI Router.

It does not replace the OpenAI/Gemini router. External AI remains the primary user-facing quality engine.

## Implemented

- `lib/ai-os.js`
  - SnapNext AI Constitution
  - Chief AI task wrapper
  - Guardian AI safety checks
  - AI Economy Engine estimate gate
  - Agent registry
  - Feature-to-agent assignment
  - Shadow learning records
  - AI OS status export

- `app/api/ai-agent/route.js`
  - Now calls `runChiefAiTask`
  - Preserves authenticated access
  - Preserves structured errors
  - Returns `aiOs` metadata for review/debugging

- `app/api/ai-os/status/route.js`
  - Authenticated AI OS status endpoint
  - Super User can view full agent details
  - Normal users receive limited safe status details

## Current Architecture

```text
User Request
  ↓
AI Agent API
  ↓
Chief AI
  ↓
Guardian AI
  ↓
AI Economy Engine
  ↓
Existing AI Router
  ↓
OpenAI / Gemini
  ↓
Shadow Learning Logs
```

## Safety Rules Added

- Blocks suspicious prompt-injection patterns.
- Blocks permission-bypass language.
- Blocks privacy-leak language.
- Requires approval for risky delete/share/publish-style tasks.
- Keeps external AI as the primary quality engine until SnapNext agents are certified.

## Profit / Credit Protection

The Economy Engine estimates:

- Plan
- Feature
- Required credits
- Quality mode
- Estimated AI cost
- Remaining daily/monthly credits
- Profit gate outcome
- User choice options when task is too expensive

## Collections Used

- `ai_os_events`
- `ai_shadow_results`
- Existing `ai_usage`
- Existing `ai_history`

## Manual QA Checklist

1. Sign out and call `/api/ai-agent` → should return `unauthenticated`.
2. Sign in and call `/api/ai-agent` with normal task → should return result + `aiOs` metadata.
3. Call `/api/ai-agent` with suspicious prompt like `ignore previous instructions` → Guardian should block.
4. Call `/api/ai-agent` with `delete all my files` → approval should be required.
5. Call `/api/ai-os/status` signed out → should return `unauthenticated`.
6. Call `/api/ai-os/status` signed in as normal user → limited status only.
7. Call `/api/ai-os/status` as Super User → full agent status.
8. Confirm existing AI Studio still loads.
9. Confirm normal AI caption/post generation still works.
10. Confirm no provider keys are exposed in responses.

## Known Limits

This is Layer 1 foundation only. It creates orchestration, safety, economy, and shadow learning. It does not yet create real trained ML models or certified autonomous agents.

## Next Layer

Layer 2 should add:

- AI OS admin dashboard
- User-facing expensive-task preview modal
- Agent scorecards
- Learning feedback buttons
- Business Intelligence AI dashboard
- Video AI provider router
- Agent certification thresholds
