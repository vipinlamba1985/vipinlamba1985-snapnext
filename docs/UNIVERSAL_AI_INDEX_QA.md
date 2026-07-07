# Universal AI Index — QA Checklist

Do not enable `AI_INDEX_ENABLED=true` for normal users until the required checks pass.

## A. Rollout gate

- [ ] With `AI_INDEX_ENABLED=false`, a normal user receives `ai_index_not_enabled` from enqueue, process, status, search, and feedback routes.
- [ ] Super User can access the controlled test routes while the flag remains false.
- [ ] A request with no valid user is rejected.
- [ ] An incorrect or missing worker secret cannot process cross-user jobs.

## B. Ownership isolation

- [ ] User A cannot enqueue User B's media ID.
- [ ] User A cannot read User B's intelligence status.
- [ ] User A cannot search User B's intelligence.
- [ ] Feedback with a media ID owned by another user is rejected.
- [ ] Authenticated user processing is always restricted to that user's jobs.

## C. Queue behavior

- [ ] Enqueue one owned photo and confirm one queued job is created.
- [ ] Enqueue the same photo again and confirm no second active job is created.
- [ ] Process one queued job and confirm it becomes completed, deferred, cancelled, retryable, or failed with an explicit status.
- [ ] A completed ready record with the same source hash returns `already_indexed`.
- [ ] A temporary processing failure schedules a bounded retry.
- [ ] After maximum attempts, the job stops as failed.

## D. Existing analysis reuse

Use a photo that already contains successful `media.aiAnalysis` data.

- [ ] Process the asset.
- [ ] Confirm `asset_intelligence.perceptionSource` is `existing_media_analysis`.
- [ ] Confirm the existing media record is unchanged by the Universal AI Index worker.
- [ ] Confirm no second image-vision call was required for this case.

## E. Fresh perception fallback

Use an asset with no usable analysis.

- [ ] Confirm a supported photo can use the existing image analysis path.
- [ ] Confirm a supported small video can use the existing video analysis path.
- [ ] Confirm provider failure produces partial intelligence or a bounded retry instead of fabricated facts.
- [ ] Confirm unavailable analysis does not invent names, relationships, locations, dates, or events.

## F. Large asset handling

- [ ] Photo above `AI_IMAGE_ANALYSIS_MAX_BYTES` is deferred.
- [ ] Video above `AI_VIDEO_ANALYSIS_MAX_BYTES` is deferred.
- [ ] Deferred assets are not loaded fully into the worker process.
- [ ] Original media remains available and unchanged.

## G. Screenshot and document intelligence

Test screenshots containing visible, unambiguous text.

- [ ] Email screenshot is classified appropriately when evidence supports it.
- [ ] Receipt is classified appropriately when evidence supports it.
- [ ] Scanned official document is classified appropriately when evidence supports it.
- [ ] Visible text is searchable.
- [ ] A clear requested action can create an `actionCandidate`.
- [ ] A clear required task can create a `taskCandidate`.
- [ ] Suggested actions and tasks contain `approvalRequired: true`.
- [ ] Ambiguous text does not create unsupported deadlines or tasks.

## H. Search and agent grounding

- [ ] Search by filename finds the correct asset.
- [ ] Search by OCR text finds the correct screenshot.
- [ ] Search by topic, place, object, activity, or organization returns grounded results when present.
- [ ] Search does not return another user's data.
- [ ] Ask SnapNext receives the richer intelligence context.
- [ ] Ask SnapNext returns matched media IDs only from the authenticated user's library.
- [ ] Insufficient evidence produces an honest limitation instead of invented detail.

## I. Private feedback learning

- [ ] Supported feedback event is stored.
- [ ] Unsupported event type is rejected.
- [ ] Feedback is stored with `consentLevel: personal_learning_only`.
- [ ] No feedback event automatically triggers external model training.
- [ ] Feedback for an unowned media ID is rejected.

## J. Privacy reset

- [ ] Reset without exact confirmation is rejected.
- [ ] Reset with `DELETE_AI_INDEX` removes analysis jobs.
- [ ] Reset removes asset intelligence.
- [ ] Reset removes AI feedback events.
- [ ] Reset does not delete original media.
- [ ] Reset does not delete the existing legacy media analysis.

## K. Production blockers

- [ ] Full account deletion calls the Universal AI Index cleanup helper.
- [ ] Worker secret exists only on the server.
- [ ] Worker and provider secrets are not exposed through `NEXT_PUBLIC_*` variables.
- [ ] Queue failure, latency, provider, and cost telemetry is available.
- [ ] Provider retention and privacy configuration has been reviewed.
- [ ] User-facing AI/privacy controls are ready.
- [ ] `npm run build` passes on the production branch.
- [ ] Preview deployment smoke tests pass before merge.
