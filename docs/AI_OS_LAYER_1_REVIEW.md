# SnapNext AI OS — Layers 1, 2, and 3 Self Review

## Status

SnapNext AI OS now has:

- Layer 1: orchestration, safety, economy, and shadow logging
- Layer 2: premium ChatGPT-like specialist agents
- Layer 3: feedback learning, scorecards, and business intelligence endpoints

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

### Layer 3

- `lib/ai-learning-engine.js`
  - Records user feedback for agent learning
  - Computes agent scorecards
  - Calculates user approval rate
  - Calculates fallback failure rate
  - Calculates observed confidence
  - Calculates certification readiness
  - Generates AI business intelligence snapshot

- `app/api/ai-os/feedback/route.js`
  - Authenticated endpoint for feedback ratings
  - Supports accepted, rejected, edited, saved, shared

- `app/api/ai-os/scorecards/route.js`
  - Super User-only endpoint for agent scorecards
  - Shows readiness and certification status

- `app/api/ai-os/business/route.js`
  - Super User-only AI business intelligence endpoint
  - Shows requests, credits, estimated AI cost, failures, most-used feature, and most-expensive feature

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
  ↓
Feedback Learning + Scorecards + Business Intelligence
```

## Premium Assistant Direction

Layer 2 and Layer 3 are designed to feel like a premium ChatGPT-style assistant experience, but specialized for SnapNext.

The user talks to one intelligent assistant. Behind the scenes, Chief AI assigns the best specialist agent, external AI protects quality, and SnapNext agents learn from shadow results and user feedback.

Specialist agents do not yet replace external AI. They observe, create shadow plans, collect feedback, learn, and prepare for certification.

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

Layer 3 adds business intelligence visibility for:

- Total AI requests
- Credits consumed
- Estimated AI cost
- Failure rate
- Most-used AI feature
- Most-expensive AI feature
- Cost optimization recommendation

## Collections Used

- `ai_os_events`
- `ai_shadow_results`
- `ai_agent_feedback`
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
13. POST `/api/ai-os/feedback` with `agentId`, `rating`, and `requestId` → should save feedback.
14. GET `/api/ai-os/scorecards` as normal user → should return 403.
15. GET `/api/ai-os/scorecards` as Super User → should return scorecards.
16. GET `/api/ai-os/business` as normal user → should return 403.
17. GET `/api/ai-os/business` as Super User → should return AI business snapshot.
18. Confirm existing AI Studio still loads.
19. Confirm normal AI caption/post generation still works.
20. Confirm no provider keys are exposed in responses.

## Known Limits

This is Layer 3 foundation. It creates learning data capture, scorecards, and business intelligence snapshots. It does not yet create real trained ML models, autonomous agents, or a visual dashboard.

## Next Layer

Layer 4 should add:

- AI OS admin dashboard UI
- User-facing expensive-task preview modal
- Feedback buttons inside AI Studio
- Video AI provider router
- Agent promotion/restriction logic
- Certification workflow
- Automated alerts for high AI cost or failing agents
