# Smart Import — launch status

This document is the launch contract for cloud intake in SnapNext.

**Launch product:** Smart Import — user-selected media intake.

**Not a launch product:** continuous whole-cloud synchronization.

The provider registry remains in `lib/smart-sync/providers.js`, but a provider being technically known to the code does not mean SnapNext may create a new persistent/background connection for it.

## Launch matrix

| Source | Launch behavior | Background whole-library sync |
| :--- | :--- | :--- |
| Google Drive | ✅ User selects files in Google Picker, then SnapNext imports those files | ❌ Disabled |
| Google Photos | ✅ User selects media in Google Photos Picker; selection becomes a durable manual import job | ❌ Disabled |
| Dropbox | File/Add fallback; legacy connections may be removed | ❌ New persistent OAuth disabled |
| OneDrive | File/Add fallback; legacy connections may be removed | ❌ New persistent OAuth disabled |
| iPhone / iPad | Native-device workstream; do not claim complete until real native producer/device QA ships | N/A |
| Android | Native-device workstream; do not claim complete until real native producer/device QA ships | N/A |

## Product ownership

Smart Import belongs to **(+) Add**.

User path:

```text
(+) Add
  → Import from Cloud / Smart Import
  → choose provider
  → choose photos/videos
  → SnapNext imports only the selected media
  → originals remain unchanged
```

`/imports` is the active launch surface.

`/smart-sync` is now an explanatory/future surface for **Auto Cloud Sync**. It must not silently recreate the old automatic provider-crawl behavior.

More → Integrations may manage service authorization, but it is not a second import workflow.

## Google Drive

Google Drive uses OAuth plus Google Picker.

The requested scope is:

`https://www.googleapis.com/auth/drive.file`

This is a **per-file scope, not a read-only one**. Google does not provide an equivalent per-file read-only scope. SnapNext therefore enforces read-only behavior in its own implementation:

- no whole-Drive enumeration;
- no Drive upload;
- no Drive delete;
- no Drive permission changes;
- only metadata/content reads for files the user selected.

The old `drive.readonly` path must not return. Existing grants with broader scopes are treated as needing re-authorization rather than being silently reused.

Google Picker requires both:

- `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY`
- `GOOGLE_DRIVE_PROJECT_NUMBER`

The import endpoint works in bounded batches. Google Drive import is **restart-safe/idempotent**, not a durable background queue: files already completed remain in SnapNext, and selecting the same items again skips copies that are already protected.

## Google Photos

Google Photos uses the Picker permission:

`photospicker.mediaitems.readonly`

The user explicitly selects media in Google's Picker. SnapNext inventories only that selection and creates a durable job with:

- provider `google_photos`;
- mode `manual_selection`;
- the selected provider file IDs only.

The job is resumable. A failed job is retried through the existing retry transition and continues on the **same selected job**, rather than discovering new media.

`/api/cron/smart-import-recovery` is a low-frequency server recovery fallback. It processes only already-created Google Photos manual-selection jobs. It does **not** scan cloud connections, discover whole libraries, or create automatic cloud jobs.

## Dropbox and OneDrive

Dropbox and OneDrive adapter code may remain for legacy cleanup and future picker work, but launch behavior is deliberately narrower:

- no new persistent/background OAuth start;
- no automatic provider discovery job;
- no scheduled Dropbox/OneDrive polling;
- no claim that the provider is launch-connected merely because credentials exist.

Users may download/select files from those services and import them through the normal Add flow today.

When a safe user-selected picker is later implemented and approved, the provider can move from `deferred_picker` to `user_selected_picker` in the registry with corresponding tests.

## Auto Cloud Sync — future premium capability

Auto Cloud Sync may be reconsidered after launch only when all of the following are justified:

1. meaningful user demand;
2. provider approval and stable API access;
3. secure refresh-token lifecycle;
4. rate-limit and reconciliation design;
5. support/maintenance cost;
6. storage and egress economics;
7. explicit product consent and easy disconnect;
8. a durable worker architecture that survives client lifecycle.

It must not be enabled by simply restoring an old UI toggle or cron.

## Launch safety invariants

1. User-selected import is the default cloud model.
2. Google Drive cannot enumerate a whole Drive.
3. Google Photos jobs contain only Picker-selected media.
4. Dropbox and OneDrive cannot create new background OAuth connections at launch.
5. Generic web Smart Sync jobs require explicit selected file IDs.
6. No scheduled job polls Google Drive, Dropbox, or OneDrive.
7. The Smart Import recovery cron cannot create a job.
8. Import never modifies or deletes the provider original.
9. Plan capacity and duplicate protection still apply before SnapNext stores media.
10. Auto Cloud Sync remains future-only until deliberately re-approved.

These invariants are enforced by `tests/smart-import-launch.test.mjs`, the Google Drive scope tests, provider-surface tests, and existing storage/import tests.

## Environment setup

Use `docs/SMART_SYNC_PROVIDER_ENV_CHECKLIST.md` for the current launch variables. Do not provision Dropbox/OneDrive credentials merely to satisfy a launch checklist; they are not required for Smart Import launch.

## Native media

Native iOS/Android media intake is a separate client implementation track. Server contracts alone are not proof that native library import/background upload is complete. Do not market native automatic camera-roll sync until the real native producer, permissions, lifecycle behavior and device QA are complete.

## Permanent naming rule

For launch, the feature is **Smart Import** / **Import from Cloud**.

“Auto Cloud Sync” refers only to the future continuous-sync capability. Product copy must not use “sync” for the launch picker-import workflow in a way that implies unattended background monitoring.
