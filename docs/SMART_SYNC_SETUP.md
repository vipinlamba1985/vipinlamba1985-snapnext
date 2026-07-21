# Smart Sync setup

Smart Sync uses one shared server-side job model for the web app, protected cron processing, and the native iOS/Android upload bridge. Missing provider credentials keep a provider visible as **Setup later** without exposing secrets or breaking the app.

## What is active now

- Google Drive: read-only OAuth, metadata inventory, provider-native change cursors, durable Smart Sync jobs, checksum-first duplicate checks, storage enforcement, pause/resume/retry/stop, web-assisted batches, and protected cron continuation.
- Google Photos: OAuth foundation for the Google Photos Picker API. Users must select the items they want to share with SnapNext; broad full-library read access is not used.
- Dropbox and OneDrive: OAuth connection foundations are present; import adapters must be completed before enabling them for users.
- iOS and Android: server permission, device registration, manifest, prioritization, duplicate, and capacity contracts are present. The signed native apps must implement the device-library and background-upload clients.

## Cloud inventory states

Provider metadata is stored separately in `cloud_assets`. Metadata records do not consume plan storage and do not represent a backup by themselves.

- `available_to_import`: discovered at the provider; the original has not been copied to SnapNext.
- `importing`: an approved transfer is active.
- `safe_in_snapnext`: the original was copied and SHA-256 verified, or an exact verified duplicate already exists in SnapNext.
- `capacity_blocked`: metadata is retained, but the original was not copied because plan storage is full.
- `failed`: the transfer needs attention.
- `source_removed`: the provider reported that the source item was removed.
- `unsupported`: the provider item is not a supported photo or video.

Only `media` records count as stored SnapNext memories. Provider thumbnails and metadata must never be shown as permanent backups.

## Google Drive incremental sync

1. Before the first full inventory scan, SnapNext captures a Drive start page token.
2. The initial library is enumerated with durable page tokens.
3. After initial discovery completes, the captured token becomes the change cursor.
4. Later jobs use the Drive Changes API rather than modified-time rescans.
5. `nextPageToken` is persisted while a change feed has more pages.
6. `newStartPageToken` is saved only after all discovered items on the final page are processed.
7. Removed files update metadata state but never delete an imported SnapNext memory.

This sequence prevents files changed during initial discovery from being missed.

## Duplicate verification

Duplicate checks happen in this order:

1. Same provider file ID and same provider version/checksum: already imported.
2. Provider checksum plus file size: avoid downloading when an exact stored match exists.
3. Downloaded bytes: compute SnapNext SHA-256.
4. Existing SHA-256 match: skip a duplicate after verification.
5. New bytes: save to storage, persist SHA-256 verification, then mark the cloud asset **Safe in SnapNext**.

If the same provider file ID has a newer version or checksum, SnapNext imports it as a new version and links it to the earlier media record.

## Operational metrics

Smart Sync stores cumulative and last-run metrics on the provider connection and job:

- items discovered
- metadata upserts
- provider API calls
- downloads avoided by provider checksum
- duplicates detected by SnapNext SHA-256
- bytes downloaded
- bytes stored
- items prevented by storage capacity
- unsupported items
- source removals

These metrics are visible on the Smart Sync page without exposing OAuth tokens or provider cursors.

## Web OAuth providers

### Google Drive

- `GOOGLE_DRIVE_CLIENT_ID`
- `GOOGLE_DRIVE_CLIENT_SECRET`
- Callback: `/api/cloud/google-drive/callback`
- Scope: `drive.readonly`

### Google Photos Picker

- `GOOGLE_PHOTOS_CLIENT_ID`
- `GOOGLE_PHOTOS_CLIENT_SECRET`
- Callback: `/api/smart-sync/oauth/google_photos/callback`
- Scope: `photospicker.mediaitems.readonly`
- The user selects media in a Google-managed Picker session. Do not restore the removed broad `photoslibrary.readonly` flow.

### Dropbox

- `DROPBOX_CLIENT_ID`
- `DROPBOX_CLIENT_SECRET`
- Callback: `/api/smart-sync/oauth/dropbox/callback`

### Microsoft OneDrive

- `ONEDRIVE_CLIENT_ID`
- `ONEDRIVE_CLIENT_SECRET`
- `ONEDRIVE_TENANT_ID` (use `common` unless a tenant-specific deployment is required)
- Callback: `/api/smart-sync/oauth/onedrive/callback`

## Shared secrets

- `CLOUD_CONNECTOR_SECRET`: use a long random value to encrypt cloud tokens and sign OAuth state.
- `CRON_SECRET`: protects `/api/cron/google-drive-sync`.
- `NEXT_PUBLIC_APP_URL`: production application origin.
- `NEXT_PUBLIC_IOS_APP_URL`: App Store URL when available.
- `NEXT_PUBLIC_ANDROID_APP_URL`: Google Play URL when available.

## Permission policy

- Web providers use the narrowest read-only or user-picker permission available.
- Manual mobile selection accepts limited/selected-photo permission.
- Automatic device backup requires full photo-library permission and background-upload availability.
- Contacts, microphone, location, and delete permissions are not required for Smart Sync.
- Originals are never edited or deleted.
- Duplicate and capacity checks remain mandatory.
- Only user-confirmed person IDs may be used for favorite-person priorities.

## Durable job behavior

1. The user saves a source and priority plan.
2. A plan change clears prior approval.
3. The user explicitly selects **Approve and start**.
4. One unresolved job is allowed per user/provider.
5. The worker leases a job before processing to prevent duplicate workers.
6. Google Drive processes at most 10 originals per transfer batch.
7. Metadata discovery uses provider page tokens and may inventory up to 500 provider records per discovery page.
8. The web app advances batches while open; the protected cron continues queued work later.
9. Pause, resume, retry, stop, counters, metrics, errors, and cursor position persist in MongoDB.
10. Disconnecting removes provider tokens and metadata inventory but keeps safely imported SnapNext memories.
11. Full account deletion removes profiles, jobs, devices, native-upload records, cloud metadata, and cloud tokens.

## Deployment note

The repository currently schedules the protected Google Drive cron once daily. A more frequent schedule requires a Vercel plan that supports the desired cron frequency, or another trusted scheduler calling the same endpoint with `Authorization: Bearer <CRON_SECRET>`.
