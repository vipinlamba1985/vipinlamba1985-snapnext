# Smart Import — launch status

This document is the launch contract for cloud intake in SnapNext.

**Launch product:** Smart Import — user-selected media and document intake.

**Not a launch product:** continuous whole-cloud synchronization.

The provider registry remains in `lib/smart-sync/providers.js`. All launch web providers are picker-based and must not create background whole-account discovery.

## Launch matrix

| Source | Launch behavior | Background whole-library sync |
| :--- | :--- | :--- |
| Google Drive | ✅ User selects files in Google Picker, then SnapNext imports those files | ❌ Disabled |
| Google Photos | ✅ User selects media in Google Photos Picker; selection becomes a durable manual import job | ❌ Disabled |
| Dropbox | ✅ User selects photos/videos/documents in Dropbox Chooser; SnapNext immediately consumes selected short-lived links | ❌ Disabled |
| OneDrive | ✅ User selects photos/videos/documents in Microsoft’s hosted picker; SnapNext immediately consumes selected short-lived links | ❌ Disabled |
| iPhone / iPad | Native-device workstream; do not claim complete until real native producer/device QA ships | N/A |
| Android | Native-device workstream; do not claim complete until real native producer/device QA ships | N/A |

## Product ownership

Smart Import belongs to **(+) Add**.

```text
(+) Add
  → Import from Cloud / Smart Import
  → choose provider
  → choose files
  → SnapNext imports only the selected files
  → originals remain unchanged
```

`/imports` is the active launch surface. `/smart-sync` remains an explanatory/future surface for **Auto Cloud Sync** and must not recreate automatic provider crawling.

The ordinary Add screen must describe all four launch Smart Import providers consistently: Google Photos, Google Drive, Dropbox, and OneDrive.

## Google Drive

Google Drive uses OAuth plus Google Picker with `https://www.googleapis.com/auth/drive.file`. This is a **per-file scope, not a read-only one**. SnapNext therefore enforces read-only behavior in code: no whole-Drive enumeration, no Drive uploads, no Drive deletes, and no Drive permission changes. Picker imports are bounded and content-deduplicated.

## Google Photos

Google Photos uses `photospicker.mediaitems.readonly`. Picker selections become durable `manual_selection` jobs. `/api/cron/smart-import-recovery` may recover only those already-created jobs and never discovers a library or creates background work.

## Dropbox

Dropbox uses the hosted Chooser. It requires the Dropbox app key (`DROPBOX_CLIENT_ID`) and registered SnapNext domains, but no SnapNext-managed OAuth refresh token for this path.

SnapNext requests direct links for explicitly selected items with multi-select enabled. Those links are short-lived, are consumed immediately, and are not used to browse the rest of the Dropbox account.

## OneDrive

OneDrive uses Microsoft’s hosted JavaScript picker with the public Entra application ID (`ONEDRIVE_CLIENT_ID`) and a registered redirect page at `/onedrive-picker-redirect`.

The picker returns short-lived download URLs for selected items. The picker response can also contain an access token; SnapNext deliberately discards that token and sends only the selected download URLs to the server. No OneDrive refresh token is stored and no background connection/job is created.

## Remote selected-file import

Dropbox and OneDrive selections enter `/api/smart-import/remote-selection` in small batches. The server validates HTTPS provider hosts and every redirect, enforces file/plan/storage limits, supports photos/videos/PDFs/common office documents, computes SHA-256 duplicate protection, and stores only successfully verified selections.

If the browser closes mid-import, completed files remain safe. Reselecting the remaining files is idempotent because the stored content hash prevents duplicate storage.

## Auto Cloud Sync — future premium capability

Auto Cloud Sync may be reconsidered after launch only when meaningful user demand, provider approval, secure long-lived authorization, maintenance cost, storage economics and durable background architecture justify it. It must not be enabled by restoring an old toggle or cron.

## Launch safety invariants

1. Every web cloud import starts with an explicit user picker/chooser selection.
2. Google Drive cannot enumerate a whole Drive.
3. Google Photos jobs contain only Picker-selected media.
4. Dropbox Chooser links represent only selected files and no Dropbox OAuth token is stored for the launch path.
5. OneDrive picker access tokens are discarded; only selected short-lived download URLs reach SnapNext.
6. Generic web Smart Sync jobs require explicit selected file IDs.
7. No scheduled job polls Google Drive, Dropbox, or OneDrive.
8. Import never modifies or deletes the provider original.
9. Plan capacity and duplicate protection apply before storage.
10. Auto Cloud Sync remains future-only until deliberately re-approved.

## Current code validation

The four-provider Smart Import implementation passed **565 tests with 0 failures**, compiled successfully with the optimized Next.js build, and generated **107/107 pages**, including `/onedrive-picker-redirect`. Each final documentation-only head must continue passing the same repository build gate before it is treated as validated.

This validates code/build behavior only. Real provider launch readiness still requires the provider-console setup and signed-in selection tests listed in `docs/SMART_SYNC_PROVIDER_ENV_CHECKLIST.md`.

## Permanent naming rule

For launch, the feature is **Smart Import** / **Import from Cloud**. “Auto Cloud Sync” refers only to the future continuous-sync capability.
