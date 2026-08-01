# Smart Sync provider environment checklist

The provider workers are part of the application code, but each external provider must issue its own OAuth credentials. Never commit those credentials to GitHub.

## Vercel variables

Add each variable to both **Preview** and **Production**, then redeploy:

- `CLOUD_CONNECTOR_SECRET`
- `CRON_SECRET`
- `NEXT_PUBLIC_APP_URL=https://snapnext.ai`
- `GOOGLE_DRIVE_CLIENT_ID`
- `GOOGLE_DRIVE_CLIENT_SECRET`
- `GOOGLE_PHOTOS_CLIENT_ID`
- `GOOGLE_PHOTOS_CLIENT_SECRET`
- `DROPBOX_CLIENT_ID`
- `DROPBOX_CLIENT_SECRET`
- `ONEDRIVE_CLIENT_ID`
- `ONEDRIVE_CLIENT_SECRET`
- `ONEDRIVE_TENANT_ID=common`

## Registered production callbacks

- Google Drive: `https://snapnext.ai/api/cloud/google-drive/callback`
- Google Photos: `https://snapnext.ai/api/smart-sync/oauth/google_photos/callback`
- Dropbox: `https://snapnext.ai/api/smart-sync/oauth/dropbox/callback`
- OneDrive: `https://snapnext.ai/api/smart-sync/oauth/onedrive/callback`

Add the matching preview callback only while testing a protected preview deployment. Remove unused callbacks after QA.

## Provider permissions

- Google Drive: `drive.readonly`
- Google Photos: `photospicker.mediaitems.readonly`
- Dropbox: `files.metadata.read`, `files.content.read`
- OneDrive: `Files.Read`, `offline_access`

SnapNext does not require provider write or delete access.

## Native camera roll (iPhone / Android)

These providers need **no server credentials** — they are gated on the mobile
app, not on environment variables. The server protocol is complete; the client
that produces a photo manifest is not built yet, and no photo-library Capacitor
plugin is installed. See `docs/CLOUD_SYNC_STATUS.md` for exactly what remains.

Do not describe iPhone or Android camera-roll sync as available until that work
ships and is verified on real hardware.
