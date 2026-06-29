# SnapNext AI OS — Layers 1 to 8 Self Review

## Status

SnapNext AI OS now has:

- Layer 1: orchestration, safety, economy, and shadow logging
- Layer 2: premium ChatGPT-like specialist agents
- Layer 3: feedback learning, scorecards, and business intelligence endpoints
- Layer 4: AI Command Center UI and AI Studio feedback learning hooks
- Layer 5: task preview, video routing foundation, certification planning, and AI alerts
- Layer 6: video adapter stubs, agent governance persistence, and AI Command navigation
- Layer 7: AI Video Studio page, AI Video navigation, and governance controls in AI Command Center
- Layer 8: AI Studio task preview, credit/upgrade guidance, and safety rollback recommendations

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

### Layer 8

- `lib/ai-safety-automation.js`
  - Generates rollback recommendations from readiness/alert signals
  - Applies Super User-approved rollback recommendation through governance
  - Builds credit/upgrade guidance for premium tasks

- `app/api/ai-os/safety/route.js`
  - Super User-only endpoint for safety recommendations
  - `GET` returns rollback recommendations
  - `POST` applies approved rollback action

- `app/(app)/ai-studio/page.js`
  - Adds `Preview cost` button
  - Shows agent, credits, quality, options, and upgrade link when task is too expensive

- `app/(app)/ai-command/page.js`
  - Shows safety rollback recommendations
  - Lets Super User apply recommendation safely

## Manual QA Checklist

1. Run `yarn build`.
2. Open `/ai-studio`, enter a topic, click `Preview cost`, and confirm credits/options appear.
3. Confirm upgrade link appears when preview says credits are insufficient.
4. Open `/ai-video` signed in and preview a cinematic video task.
5. Open `/ai-command` as Super User/Admin and confirm safety rollback recommendations section works.
6. GET `/api/ai-os/safety` as normal user → should return 403.
7. GET `/api/ai-os/safety` as Super User → should return recommendations.
8. POST `/api/ai-os/safety` as Super User with a recommendation → should update governance.
9. Confirm existing AI caption/post generation still works.
10. Confirm no provider keys are exposed.

## Known Limits

This is Layer 8 foundation. It adds preview and safety automation UI, but does not yet connect real video provider APIs, train custom ML models, or run autonomous rollback without Super User approval.

## Next Layer

Layer 9 should add real provider adapter contracts, stronger build-time tests, and a controlled rollout flag so AI OS features can be enabled/disabled safely per environment.
