# Smart Import provider environment checklist

Launch policy: SnapNext uses **user-selected Smart Import**, not continuous whole-cloud synchronization. Only configure credentials for launch providers that have a real picker path. Never commit credentials to GitHub.

## Required for launch

Add these to the environments where Smart Import will be tested or used, then redeploy:

- `CLOUD_CONNECTOR_SECRET`
- `CRON_SECRET`
- `NEXT_PUBLIC_APP_URL=https://snapnext.ai`

### Google Drive

- `GOOGLE_DRIVE_CLIENT_ID`
- `GOOGLE_DRIVE_CLIENT_SECRET`
- `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY`
- `GOOGLE_DRIVE_PROJECT_NUMBER`

Production callback:

- `https://snapnext.ai/api/cloud/google-drive/callback`

Permission requested by SnapNext:

- `https://www.googleapis.com/auth/drive.file`

This is a **per-file scope, not a read-only one**. SnapNext's import implementation is read-only by code: it only reads metadata/content for files the user chooses in Google Picker. It does not enumerate the user's whole Drive and does not call Drive write/delete/permissions APIs.

`NEXT_PUBLIC_GOOGLE_PICKER_API_KEY` should be restricted to the SnapNext web origin. `GOOGLE_DRIVE_PROJECT_NUMBER` is required by the Picker integration; the server fails closed when either Picker value is missing.

### Google Photos

- `GOOGLE_PHOTOS_CLIENT_ID`
- `GOOGLE_PHOTOS_CLIENT_SECRET`

Production callback:

- `https://snapnext.ai/api/smart-sync/oauth/google_photos/callback`

Permission requested by SnapNext:

- `photospicker.mediaitems.readonly`

Google Photos uses the Picker flow. The user explicitly chooses media, and SnapNext turns that selection into a durable manual import job.

## Not required for launch

Do **not** make these credentials a launch blocker:

- `DROPBOX_CLIENT_ID`
- `DROPBOX_CLIENT_SECRET`
- `ONEDRIVE_CLIENT_ID`
- `ONEDRIVE_CLIENT_SECRET`
- `ONEDRIVE_TENANT_ID`

Dropbox and OneDrive are registered as `future_picker` providers at launch. The product does not create new persistent/background OAuth connections for them. Users can download/select those files and bring them through the normal Add flow until a user-selected picker implementation is approved and shipped.

Legacy Dropbox/OneDrive credentials may remain in an existing deployment temporarily so old connections can be inspected/disconnected, but they are not part of the launch Smart Import dependency set.

## Recovery cron

Vercel schedules:

- `/api/cron/smart-import-recovery`

The route is protected by `CRON_SECRET` and processes only already-created **Google Photos manual-selection jobs**. It does not scan cloud accounts, discover whole libraries, or create automatic cloud jobs.

The cron is a recovery fallback. The normal Google Photos flow begins processing immediately after the user completes a picker selection.

## Native device media

iPhone and Android media access requires no cloud-provider server OAuth credentials. Native media-library producers remain a separate mobile implementation/verification track and must not be represented as finished merely because the server contract exists.

## Launch verification

Before calling Smart Import production-ready:

1. Confirm the Google Drive OAuth client and callback belong to the production SnapNext project.
2. Confirm Drive Picker API key origin restrictions and the project number.
3. Confirm the granted Drive scope is `drive.file`; old broader grants must be revoked/re-authorized.
4. Confirm the Google Photos OAuth client and callback.
5. Complete one signed-in Google Drive Picker import on the production-like deployment.
6. Complete one signed-in Google Photos Picker import, close the client mid-job, and verify the same selected job can resume/recover.
7. Confirm Dropbox/OneDrive show the launch fallback rather than offering a new background connection.
8. Confirm no scheduled route polls Google Drive, Dropbox, or OneDrive.
