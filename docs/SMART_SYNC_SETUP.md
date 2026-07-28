# Smart Sync setup

Smart Sync uses one shared server-side pipeline for cloud metadata inventory, priority selection, duplicate detection, protected storage, verification, durable jobs, and cron continuation. Provider connectors only handle authorization, change discovery, metadata normalization, and original-file download.

Missing provider credentials keep that source disabled without exposing secrets or breaking the rest of the app.

## What is active

- **Google Drive:** read-only OAuth, metadata inventory, Drive change cursors, durable jobs, priority selection, protected copies, verification, and automatic continuation.
- **Dropbox:** read-only OAuth, recursive initial discovery, `list_folder/continue` cursors, durable jobs, protected copies, verification, and automatic continuation.
- **Microsoft OneDrive:** read-only OAuth, Microsoft Graph delta links, durable jobs, protected copies, verification, and automatic continuation.
- **Google Photos:** Google Photos Picker sessions. The user explicitly chooses up to 500 items per SnapNext session; selected items feed the same inventory, duplicate, capacity, storage, and verification pipeline. It is not presented as whole-library background sync.
- **iOS and Android:** server permission, device registration, manifest, prioritization, duplicate, and capacity contracts are present. Signed native apps must still implement camera-roll enumeration and operating-system background upload clients.

## Shared pipeline

Every active web provider follows the same stages:

1. Discover provider changes or receive an explicit Google Photos selection.
2. Normalize metadata into `cloud_assets`.
3. Select items according to the approved outcome and priority rules.
4. Check same-source versions, provider checksums, storage capacity, and SnapNext SHA-256 duplicates.
5. Save approved originals into protected storage.
6. Persist verification before marking an item **Safe in SnapNext**.

Provider originals are never edited or deleted.

## User outcomes

- `index_only`: understand the source without copying originals.
- `protect_important`: protect provider favourites and recent memories where those signals are available. Explicit Google Photos selections are treated as user-approved important items.
- `protect_everything_that_fits`: protect eligible items until the available SnapNext storage is reached.

## Cloud inventory states

Provider metadata is stored separately in `cloud_assets`. Metadata records do not consume plan storage and do not represent a backup by themselves.

- `available_to_import`: discovered at the provider; the original has not been copied to SnapNext.
- `importing`: an approved transfer is active.
- `safe_in_snapnext`: the original was copied and SHA-256 verified, or an exact verified duplicate already exists in SnapNext.
- `capacity_blocked`: metadata is retained, but the original was not copied because plan storage is full.
- `failed`: the transfer needs attention.
- `source_removed`: the provider reported that the source item was removed.
- `unsupported`: the provider item is not a supported photo or video.

Only `media` records count as stored SnapNext memories.

## Incremental cursors

### Google Drive

1. Capture a Drive start page token before initial discovery.
2. Complete paginated initial inventory.
3. Promote the captured token to the change cursor.
4. Persist `nextPageToken` while pages remain.
5. Save `newStartPageToken` only after the final discovered batch is processed.

### Dropbox

1. Start with recursive `files/list_folder` discovery.
2. Persist the returned cursor while `has_more` is true.
3. Continue with `files/list_folder/continue`.
4. Keep the final cursor for later change-only runs.
5. Treat deleted entries as source removals without deleting protected SnapNext memories.

### OneDrive

1. Begin with Microsoft Graph `drive/root/delta`.
2. Persist each `@odata.nextLink` during pagination.
3. Save the final `@odata.deltaLink` after all discovered items are processed.
4. Use the delta link for later change-only runs.
5. Treat deleted drive items as source removals without deleting protected SnapNext memories.

### Google Photos

Google Photos Picker sessions are temporary and user initiated:

1. SnapNext creates a Picker session after the user approves the Smart Sync plan.
2. The user chooses items in Google’s Picker interface.
3. SnapNext polls the session until the selection is complete.
4. Selected metadata and temporary download URLs are inventoried.
5. The durable job copies or indexes the items before those URLs expire.
6. SnapNext deletes the completed Picker session and its temporary database record.

## Duplicate verification

Duplicate checks happen in this order:

1. Same provider file ID and same provider version/checksum.
2. Provider checksum plus file size when the provider supplies a stable checksum.
3. Downloaded bytes are hashed with SHA-256.
4. An existing SHA-256 match is reused as an exact verified duplicate.
5. New bytes are saved, verified, and only then marked **Safe in SnapNext**.

A newer provider version is imported as a new media version and linked to the earlier record.

## Operational metrics

Smart Sync stores cumulative and last-run metrics on provider connections and jobs:

- items discovered and indexed
- metadata upserts
- provider API calls
- provider-checksum skips
- SnapNext SHA-256 duplicate skips
- bytes downloaded and stored
- capacity-blocked items
- unsupported and source-removed items

The normal user experience shows calm progress. Detailed metrics stay under **Technical details**.

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
- Do not restore broad Google Photos library scopes.

### Dropbox

- `DROPBOX_CLIENT_ID`
- `DROPBOX_CLIENT_SECRET`
- Callback: `/api/smart-sync/oauth/dropbox/callback`
- Scopes: `files.metadata.read`, `files.content.read`
- Configure offline access so SnapNext receives a refresh token.

### Microsoft OneDrive

- `ONEDRIVE_CLIENT_ID`
- `ONEDRIVE_CLIENT_SECRET`
- `ONEDRIVE_TENANT_ID=common`
- Callback: `/api/smart-sync/oauth/onedrive/callback`
- Scopes: `offline_access`, `Files.Read`

The callback URLs must also be registered exactly in each provider console for `https://snapnext.ai`.

## Shared secrets

- `CLOUD_CONNECTOR_SECRET`: long random value used for AES-GCM token encryption and HMAC-signed OAuth state.
- `CRON_SECRET`: protects `/api/cron/google-drive-sync`, which now continues Google Drive, Dropbox, OneDrive, and queued Google Photos jobs.
- `NEXT_PUBLIC_APP_URL`: production application origin.

## Permission policy

- Web providers use read-only or user-picker permissions.
- Contacts, microphone, location, provider-write, and provider-delete permissions are not required.
- Only user-confirmed person IDs may be used for favourite-person priorities.
- Google Photos never claims automatic whole-library access.
- Device background sync remains native-only.

## Durable job behaviour

1. Plan changes clear prior approval.
2. One unresolved job is allowed per user/provider.
3. Workers lease jobs before processing to prevent duplicate workers.
4. At most 10 originals are transferred per job batch.
5. Provider cursors and progress checkpoints persist after every batch.
6. The web app advances active batches while open; the protected daily cron continues queued work later.
7. Pause, resume, retry, stop, counters, metrics, errors, and cursor positions persist in MongoDB.
8. Disconnecting removes local provider tokens and stops future sync. Already protected SnapNext memories remain safe.
9. Full account deletion removes profiles, jobs, Picker sessions, native-upload records, cloud metadata, and cloud tokens.

## Deployment checklist

For each web provider:

1. Create the provider OAuth app.
2. Add the exact production callback URL.
3. Grant only the documented read-only scopes.
4. Add the client ID and secret to both Vercel Preview and Production environments.
5. Redeploy after adding variables.
6. Sign in to SnapNext and confirm the source reports **Connected** before starting a job.
