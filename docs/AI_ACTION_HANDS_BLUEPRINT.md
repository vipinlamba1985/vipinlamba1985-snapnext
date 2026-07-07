# SnapNext AI Action Hands Blueprint

Updated: 2026-07-07

## Review conclusion

The Universal AI Index already gives SnapNext the brain layers:

1. SEE — analyze photos, videos, screenshots, scans, and text.
2. READ — extract OCR, dates, topics, tasks, and action candidates.
3. REMEMBER — keep account-scoped asset intelligence and grounded retrieval.
4. FIND — return evidence from the user's own library.

This branch adds the first HANDS layer:

5. PLAN — translate a user request into allowlisted tool proposals.
6. APPROVE — show the exact action and arguments to the authenticated owner.
7. EXECUTE — run only the approved internal tool.
8. VERIFY — persist the result and completion state in the action ledger.

## Why the uploaded prototype is not copied directly

The reviewed Vite/Express prototype has useful product ideas, but its assistant is mainly creative generation and client-side cleanup heuristics. Some cleanup actions can directly delete media after a UI click, and there is no durable AI action proposal/approval/execution ledger.

The production architecture therefore keeps the useful ideas but uses a stricter agent model:

`User request → grounded context → allowlisted proposal → explicit approval → tool execution → verified result`

The model never receives arbitrary code execution, database access, shell access, or unrestricted HTTP access.

## Phase A — built in this branch

Allowed tools:

- `create_task`
- `complete_task`
- `create_reminder`
- `create_collection`
- `add_assets_to_collection`
- `prepare_social_post`

All Phase A tools are:

- internal to SnapNext
- account-scoped
- low risk
- reversible or safely editable
- approval-required

Nothing in Phase A sends, publishes, shares, deletes, moves, purchases, emails, messages, or calls an external service.

## Action state machine

`proposed → executing → completed`

Alternative terminal states:

- `cancelled`
- `failed`

A completed action receives a persisted result and `verifiedAt` timestamp.

## Collections

- `agent_actions` — durable proposal and execution ledger
- `agent_tasks` — private tasks created by approved tools
- `agent_reminders` — private scheduled reminder records
- `agent_collections` — private AI-created asset groups
- `agent_drafts` — private unpublished social drafts

All are removed by full account deletion.

## API

### Plan and history

- `POST /api/agent-actions`
- `GET /api/agent-actions`

### Approve or cancel

- `POST /api/agent-actions/:actionId`

Body:

```json
{ "decision": "approve" }
```

or

```json
{ "decision": "cancel" }
```

## Controlled rollout

The action APIs use the same controlled rollout gate as the Universal AI Index.

While `AI_INDEX_ENABLED=false`:

- Super User can test.
- normal users are blocked.

## Phase B — next safe hands

These tools should be added only after Phase A QA and with a second approval tier:

- `prepare_email`
- `prepare_message`
- `prepare_share`
- `prepare_cleanup`
- `prepare_calendar_event`

They still do not perform the external/destructive action; they prepare a reviewable payload.

## Phase C — external/destructive execution

Examples:

- send email
- send message
- publish social post
- share with a favorite person
- delete duplicates
- move or archive files
- create external calendar event

Required safeguards before Phase C:

1. separate explicit confirmation immediately before execution
2. connector-specific scopes and least privilege
3. idempotency keys
4. destination preview
5. rate limits
6. audit event with provider response
7. retry rules that cannot duplicate side effects
8. rollback or compensating action where possible
9. no bulk destructive action from one model decision
10. user-visible history and revoke/cancel controls

## Product experience

The first review UI is available at:

`/ai-actions`

The user can:

1. describe what they want done
2. see the proposed tool and exact arguments
3. approve or cancel each action separately
4. see the verified result in the action ledger

The long-term product surface should merge these cards into Ask SnapNext chat so planning and acting feel like one assistant conversation.
