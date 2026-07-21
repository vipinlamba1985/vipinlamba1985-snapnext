# Smart Sync setup

Smart Sync uses one shared server-side job model for the web app, protected cron processing, and the native iOS/Android upload bridge. Missing provider credentials keep a provider visible as **Setup later** without exposing secrets or breaking the app.

## What is active now

- Google Drive: read-only OAuth, manual browsing, durable Smart Sync jobs, duplicate checks, storage enforcement, pause/resume/retry/stop, web-assisted batches, and protected cron continuation.
- Google Photos: OAuth foundation for the Google Photos Picker API. Users must select the items they want to share with SnapNext; broad full-library read access is not used.
- Dropbox and OneDrive: OAuth connection foundations are present; import adapters must be completed before enabling them for users.
- iOS and Android: server permission, device registration, manifest, prioritization, duplicate, and capacity contracts are present. The signed native apps must implement the device-library and background-upload clients.

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
6. Google Drive processes at most 10 files per batch.
7. The web app advances batches while open; the protected cron continues queued work later.
8. Pause, resume, retry, stop, counters, errors, and cursor position persist in MongoDB.
9. Account deletion removes profiles, jobs, devices, native-upload records, and cloud tokens.

## Deployment note

The repository currently schedules the protected Google Drive cron once daily. A more frequent schedule requires a Vercel plan that supports the desired cron frequency, or another trusted scheduler calling the same endpoint with `Authorization: Bearer <CRON_SECRET>`.
