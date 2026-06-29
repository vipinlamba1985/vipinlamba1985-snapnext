# SnapNext AI OS — Layer 1 and Layer 2 Self Review

## Status

SnapNext AI OS now has Layer 1 orchestration plus Layer 2 premium specialist agents.

It does not replace the OpenAI/Gemini router. External AI remains the primary user-facing quality engine while SnapNext agents operate in Shadow Mode and learn from production tasks.

## Implemented

### Layer 1

- `lib/ai-os.js`
  - SnapNext AI Constitution
  - Chief AI task wrapper
  - Guardian AI safety checks
  - AI Economy Engine estimate gate
  - Shadow learning records
  - AI OS status export

- `app/api/ai-agent/route.js`
  - Calls `runChiefAiTask`
  - Preserves authenticated access
  - Preserves structured errors
  - Returns `aiOs` metadata for review/debugging

- `app/api/ai-os/status/route.js`
  - Authenticated AI OS status endpoint
  - Super User can view full agent details
  - Normal users receive limited safe status details

### Layer 2

- `lib/ai-specialist-agents.js`
  - ChatGPT-like SnapNext premium assistant style
  - Specialist Agent catalog
  - Upload Agent
  - Memory Agent
  - Search Agent
  - Creator Agent
  - Cleanup Agent
  - Sharing Agent
  - Video Agent
  - Agent selection by task intent
  - Shadow plans per agent
  - Certification thresholds

- `app/api/ai-os/agents/route.js`
  - `GET` returns specialist agent status
  - `POST` previews which specialist agent would handle a task
  - Normal users see safe limited details
  - Super User sees full agent details

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
Specialist Agent Shadow Plan
  ↓
Existing AI Router
  ↓
OpenAI / Gemini
  ↓
Shadow Learning Logs
```

## Premium Assistant Direction

Layer 2 is designed to feel like a premium ChatGPT-style assistant experience, but specialized for SnapNext.

The user talks to one intelligent assistant. Behind the scenes, Chief AI assigns the best specialist agent.

Specialist agents do not yet replace external AI. They observe, create shadow plans, learn, and prepare for certification.

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
8. Call `/api/ai-os/agents` signed out → should return `unauthenticated`.
9. Call `/api/ai-os/agents` signed in → should return specialist agents.
10. POST `/api/ai-os/agents` with `create a cinematic reel from my trip` → should select Video Agent.
11. POST `/api/ai-os/agents` with `find photos from Canada` → should select Search Agent.
12. POST `/api/ai-os/agents` with `remove duplicates` → should select Cleanup Agent and keep delete in review-only mode.
13. Confirm existing AI Studio still loads.
14. Confirm normal AI caption/post generation still works.
15. Confirm no provider keys are exposed in responses.

## Known Limits

This is Layer 2 foundation. It creates premium specialist-agent behavior, routing, and shadow plans. It does not yet create real trained ML models or certified autonomous agents.

## Next Layer

Layer 3 should add:

- AI OS admin dashboard
- User-facing expensive-task preview modal
- Agent scorecards
- Learning feedback buttons
- Business Intelligence AI dashboard
- Video AI provider router
- Agent certification data model
- Agent promotion/restriction logic
