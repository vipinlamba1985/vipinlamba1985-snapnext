# SnapNext AI OS — Layers 1 to 7 Self Review

## Status

SnapNext AI OS now has:

- Layer 1: orchestration, safety, economy, and shadow logging
- Layer 2: premium ChatGPT-like specialist agents
- Layer 3: feedback learning, scorecards, and business intelligence endpoints
- Layer 4: AI Command Center UI and AI Studio feedback learning hooks
- Layer 5: task preview, video routing foundation, certification planning, and AI alerts
- Layer 6: video adapter stubs, agent governance persistence, and AI Command navigation
- Layer 7: AI Video Studio page, AI Video navigation, and governance controls in AI Command Center

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

### Layer 7

- `app/(app)/ai-video/page.js`
  - User-facing AI Video Studio
  - Lets users preview video task cost, quality mode, provider, credits, and next steps
  - Safe submit button tests the protected submit path without forcing real provider execution

- `components/AppShell.js`
  - Adds AI Video navigation for signed-in users
  - Keeps AI Command navigation Super User/Admin-only

- `app/(app)/ai-command/page.js`
  - Adds governance controls for Super User/Admin
  - Allows manual agent status updates to shadow, assisted_review, restricted, or disabled

## Current Architecture

```text
User Request
  ↓
AI Studio / AI Video / AI Agent API
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

Layer 7 gives users a visible video preview page so they understand cost/quality before any expensive generation.

## Collections Used

- `ai_os_events`
- `ai_shadow_results`
- `ai_agent_feedback`
- `ai_agent_governance`
- Existing `ai_usage`
- Existing `ai_history`

## Manual QA Checklist

1. Run `yarn build`.
2. Open `/ai-video` signed in.
3. Preview `Create a 4K cinematic reel from my trip` and confirm provider/credits/options appear.
4. Test safe submit without video provider keys and confirm no real provider call is made.
5. Open `/ai-command` as Super User/Admin and confirm governance controls appear.
6. Update one agent to `restricted`, reload, and confirm persistence.
7. Open sidebar and confirm AI Video appears for users and AI Command only appears for Super User/Admin.
8. Confirm existing AI Studio still loads.
9. Confirm normal AI caption/post generation still works.
10. Confirm no provider keys are exposed in responses.

## Known Limits

This is Layer 7 foundation. It creates UI controls for video planning and governance. It does not yet perform real video generation API calls, train custom ML models, or automatically promote agents without Super User oversight.

## Next Layer

Layer 8 should add:

- Real provider-specific adapters once provider keys and billing are approved
- Credit purchase or upgrade flow for Ultra video tasks
- User-facing task preview modal inside AI Studio
- Automated agent rollback if failure rate rises
- More complete AI Command testing tools
