# Smart Import provider environment checklist

Launch policy: SnapNext uses **user-selected Smart Import**, not continuous whole-cloud synchronization. All launch cloud providers must use an explicit picker/chooser. Never commit credentials to GitHub.

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

### Dropbox

- `DROPBOX_CLIENT_ID`

For Dropbox Chooser this value is the **Dropbox app key / client ID** and is intentionally safe to expose to the browser through SnapNext's authenticated picker-config endpoint. A Dropbox client secret is **not required** for the launch Chooser flow.

In the Dropbox developer console, register the SnapNext production domain:

- `snapnext.ai`
- `www.snapnext.ai` if the www hostname is used by the app

SnapNext uses Dropbox Chooser `linkType: direct`, `multiselect: true`, and accepts user-selected images, video and common document types. The returned direct link is short-lived and is consumed immediately by the SnapNext server. SnapNext does not store a Dropbox OAuth token or enumerate the account.

### Microsoft OneDrive

- `ONEDRIVE_CLIENT_ID`

A client secret and `ONEDRIVE_TENANT_ID` are **not required** for the hosted picker launch path. Register this production redirect URI in the Microsoft Entra app registration:

- `https://snapnext.ai/onedrive-picker-redirect`

SnapNext uses Microsoft's hosted JavaScript picker with `action: download` and multi-select. The browser passes only the short-lived download URLs for explicitly selected files to SnapNext. Any access token returned in the picker result is deliberately discarded and is never stored or sent to the SnapNext server.

OneDrive/SharePoint delegated consent is still controlled by Microsoft. Production verification must therefore test both a personal Microsoft account and the business-account types SnapNext intends to support.

## Remote picker import safety

Dropbox and OneDrive selected-file links are imported through `/api/smart-import/remote-selection`.

The server:

- accepts Dropbox and OneDrive only;
- accepts at most 5 remote files per request while the UI batches larger selections;
- validates the provider hostname on the original URL and on every redirect;
- accepts HTTPS only;
- caps each imported file at 100 MB or the user's smaller plan/storage limit;
- supports photos, videos, PDFs and common office/text document formats;
- computes SHA-256 before writing and skips content duplicates;
- checks the user's actual storage scope before saving;
- never invokes background cloud discovery or automatic AI analysis.

## Recovery cron

Vercel schedules:

- `/api/cron/smart-import-recovery`

The route is protected by `CRON_SECRET` and processes only already-created **Google Photos manual-selection jobs**. It does not scan cloud accounts, discover whole libraries, or create automatic cloud jobs.

Dropbox, OneDrive and current Google Drive picker imports are immediate/idempotent. If the browser closes mid-import, already-saved files remain safe; the user can select the remaining files again and content-hash duplicate checks prevent duplicate storage.

## Native device media

iPhone and Android media access requires no cloud-provider server OAuth credentials. Native media-library producers remain a separate mobile implementation/verification track and must not be represented as finished merely because the server contract exists.

## Launch verification

Before calling Smart Import production-ready:

1. Confirm the Google Drive OAuth client and callback belong to the production SnapNext project.
2. Confirm Drive Picker API key origin restrictions and the project number.
3. Confirm the granted Drive scope is `drive.file`; old broader grants must be revoked/re-authorized.
4. Confirm the Google Photos OAuth client and callback.
5. Confirm `DROPBOX_CLIENT_ID` is the Dropbox app key and the production SnapNext domains are registered for Chooser.
6. Confirm `ONEDRIVE_CLIENT_ID` and `https://snapnext.ai/onedrive-picker-redirect` are registered in Microsoft Entra.
7. Complete one signed-in Google Drive Picker import.
8. Complete one signed-in Google Photos Picker import, close the client mid-job, and verify the same selected job can resume/recover.
9. Complete one Dropbox multi-select import containing a photo and a document.
10. Complete OneDrive imports with the Microsoft account types SnapNext intends to support, including a photo and a document.
11. Confirm Dropbox/OneDrive selections never create a `cloud_connections` record or background Smart Sync job.
12. Confirm no scheduled route polls Google Drive, Dropbox, or OneDrive.
