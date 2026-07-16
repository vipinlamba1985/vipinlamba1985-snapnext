# Smart Sync provider setup

Smart Sync is code-ready before provider credentials are added. Missing credentials keep a provider visible as **Setup later** without exposing secrets or breaking the app.

## Web OAuth providers

### Google Drive
- `GOOGLE_DRIVE_CLIENT_ID`
- `GOOGLE_DRIVE_CLIENT_SECRET`
- Callback: `/api/cloud/google-drive/callback`

### Google Photos
- `GOOGLE_PHOTOS_CLIENT_ID`
- `GOOGLE_PHOTOS_CLIENT_SECRET`
- Callback: `/api/smart-sync/oauth/google_photos/callback`

### Dropbox
- `DROPBOX_CLIENT_ID`
- `DROPBOX_CLIENT_SECRET`
- Callback: `/api/smart-sync/oauth/dropbox/callback`

### Microsoft OneDrive
- `ONEDRIVE_CLIENT_ID`
- `ONEDRIVE_CLIENT_SECRET`
- Callback: `/api/smart-sync/oauth/onedrive/callback`

## Shared secrets
- `CLOUD_CONNECTOR_SECRET`: encrypts and signs cloud connection state.
- `CRON_SECRET`: protects scheduled Smart Sync checks.
- `NEXT_PUBLIC_APP_URL`: production application origin.

## Native providers

iOS and Android do not use OAuth for the device photo library. The app requests system photo permission, registers the authorized device with `/api/smart-sync/native/device`, sends metadata manifests to `/api/smart-sync/native/plan`, shows the returned storage-aware plan, and uploads approved assets in resumable batches.

## Safety defaults
- No provider is enabled without user approval.
- Originals are never deleted.
- Duplicate and storage checks remain mandatory.
- Unknown faces are not named or matched; only user-confirmed person IDs can be used.
- Missing credentials return a friendly setup state rather than a broken connection.
