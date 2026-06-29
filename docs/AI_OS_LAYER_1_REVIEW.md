# SnapNext AI OS — Layers 1 to 6 Self Review

## Status

SnapNext AI OS now has:

- Layer 1: orchestration, safety, economy, and shadow logging
- Layer 2: premium ChatGPT-like specialist agents
- Layer 3: feedback learning, scorecards, and business intelligence endpoints
- Layer 4: AI Command Center UI and AI Studio feedback learning hooks
- Layer 5: task preview, video routing foundation, certification planning, and AI alerts
- Layer 6: video adapter stubs, agent governance persistence, and AI Command navigation

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

### Layer 4

- `app/(app)/ai-command/page.js`
  - AI Command Center UI
  - Shows AI OS status
  - Shows specialist agents
  - Shows Super User business intelligence when available
  - Shows Super User scorecards when available
  - Shows AI alerts and certification readiness when available
  - Keeps normal-user display safe and limited

- `app/(app)/ai-studio/page.js`
  - Adds Good result / Needs work feedback buttons
  - Sends feedback to `/api/ai-os/feedback`
  - Helps SnapNext agents learn from real user satisfaction signals

### Layer 5

- `lib/ai-task-preview.js`
  - Expensive task preview engine
  - Video provider recommendation foundation
  - Certification plan generator
  - AI alert rules for cost, failure rate, and low agent readiness

- `app/api/ai-os/preview/route.js`
  - Authenticated endpoint that previews task cost, agent, quality mode, and user options before execution

- `app/api/ai-os/certification/route.js`
  - Super User-only endpoint for certification readiness and promotion blockers

- `app/api/ai-os/alerts/route.js`
  - Super User-only endpoint for AI health, cost, and learning alerts

### Layer 6

- `lib/ai-video-adapters.js`
  - Video provider availability map
  - Veo / Runway / Kling / Luma / SnapNext Storyboard routing foundation
  - Safe preview-only behavior when provider keys are missing
  - Submit stub that refuses real generation until provider keys and credit confirmation are ready

- `app/api/ai-os/video/route.js`
  - `GET` shows video provider availability
  - `POST` previews or submits video generation plan safely

- `lib/ai-agent-governance.js`
  - Super User governance state
  - Manual agent status override persistence
  - Supports training, shadow, assisted_review, certified, restricted, disabled

- `app/api/ai-os/governance/route.js`
  - Super User-only governance endpoint
  - `GET` returns agent governance state
  - `POST` updates an agent status override

- `components/AppShell.js`
  - Adds AI Command sidebar navigation for Super User/Admin

## Current Architecture

```text
User Request
  ↓
AI Studio / AI Agent API
  ↓
Task Preview / Chief AI
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
  ↓
Certification + Governance + Alerts
  ↓
Video Planning / Provider Adapter Stubs
  ↓
AI Command Center
```

## Premium Assistant Direction

Layers 2 through 6 are designed to feel like a premium ChatGPT-style assistant experience, but specialized for SnapNext.

The user talks to one intelligent assistant. Behind the scenes, Chief AI assigns the best specialist agent, external AI protects quality, SnapNext agents learn from shadow results and user feedback, and expensive tasks can be previewed before execution.

Specialist agents do not yet replace external AI. They observe, create shadow plans, collect feedback, learn, and prepare for certification.

## Safety Rules Added

- Blocks suspicious prompt-injection patterns.
- Blocks permission-bypass language.
- Blocks privacy-leak language.
- Requires approval for risky delete/share/publish-style tasks.
- Keeps external AI as the primary quality engine until SnapNext agents are certified.
- Video generation is preview-only until provider keys and explicit credit confirmation exist.
- Agent governance can restrict or disable agents if quality drops.

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

Layer 6 adds provider-key checks and refuses real video generation unless provider configuration and task approval are ready.

## Collections Used

- `ai_os_events`
- `ai_shadow_results`
- `ai_agent_feedback`
- `ai_agent_governance`
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
18. POST `/api/ai-os/preview` with `create a 4K cinematic reel from my trip` → should return task preview, Video Agent, video provider recommendation, credits/options.
19. GET `/api/ai-os/certification` as normal user → should return 403.
20. GET `/api/ai-os/certification` as Super User → should return certification plan.
21. GET `/api/ai-os/alerts` as normal user → should return 403.
22. GET `/api/ai-os/alerts` as Super User → should return alerts.
23. GET `/api/ai-os/video` signed in → should show provider availability without exposing keys.
24. POST `/api/ai-os/video` with `action: preview` → should return video plan.
25. POST `/api/ai-os/video` with `action: submit` and no provider key → should return preview-only structured error.
26. GET `/api/ai-os/governance` as normal user → should return 403.
27. GET `/api/ai-os/governance` as Super User → should return governance state.
28. POST `/api/ai-os/governance` as Super User → should update agent status override.
29. Open sidebar as Super User/Admin → AI Command should appear.
30. Open `/ai-command` as signed-in user → should show AI Command Center.
31. Open `/ai-studio`, generate AI output, click Good result / Needs work → should save feedback.
32. Confirm existing AI Studio still loads.
33. Confirm normal AI caption/post generation still works.
34. Confirm no provider keys are exposed in responses.

## Known Limits

This is Layer 6 foundation. It creates video adapter stubs and governance persistence. It does not yet perform real video generation API calls, train custom ML models, or automatically promote agents without Super User oversight.

## Next Layer

Layer 7 should add:

- UI controls for task preview inside AI Studio
- Video creation page or modal connected to `/api/ai-os/video`
- Governance controls in AI Command Center
- Provider-specific real adapters once provider keys and billing are approved
- Safer credit purchase/upgrade flow for Ultra tasks
