# Cloud Sync — what works, and what native still needs

Honest status of every sync source, so nobody promises a user something that
cannot happen yet. Providers are declared once, in
`lib/smart-sync/providers.js`; every surface reads from there.

## Web clouds — complete

| Provider | Auth | Strategy | Status |
| :--- | :--- | :--- | :--- |
| Google Drive | OAuth (`drive.readonly`) | Durable cloud job | ✅ Browse, pick, import, auto-sync |
| Google Photos | Picker OAuth | User-selected picker | ✅ User picks items, then import |
| Dropbox | OAuth | Durable cloud job | ✅ Delta cursor, checksums, download |
| OneDrive | OAuth (Graph delta) | Durable cloud job | ✅ Delta link, checksums, download |

All four are **fully implemented server-side** — listing, normalising, delta
cursors, content hashes, token refresh and download all live in
`lib/smart-sync/provider-api.js` and `lib/smart-sync/oauth-adapters.js`.

**A provider appears the moment its credentials exist.** Availability is derived
from `process.env`, never from a hand-maintained flag. If a cloud shows "Not set
up", the deployment is missing keys — see
`docs/SMART_SYNC_PROVIDER_ENV_CHECKLIST.md`. Nothing in the code needs changing.

All cloud access is **read-only**. SnapNext never requests write or delete
scope, so an import can never modify the original account.

### Two surfaces, two jobs

- **`/imports` (Cloud Sync)** — connect a cloud, browse it, pick what to bring
  in once. Google Drive browses inline; other providers connect here and are
  then managed in Smart Backup.
- **`/smart-sync` (Smart Backup)** — ongoing automatic backup: rules, modes,
  jobs, capacity.

Both render the same registry. Neither hardcodes a provider list.

## Native camera roll — server ready, client not built

**Do not tell users iPhone/Android sync works. It does not yet.**

The **server half is complete**:

- `lib/smart-sync/native-bridge.js` — `validateNativeManifest()` and
  `buildNativeUploadPlan()`, protocol version `2`.
- `POST /api/smart-sync/native/device` — register and authorise a device.
- `POST /api/smart-sync/native/plan` — send a manifest of up to 500 assets,
  receive the subset to upload, filtered by the user's rules, remaining
  capacity, and checksums SnapNext already holds.

The **client half does not exist**. `package.json` has `@capacitor/app`,
`browser`, `network`, `share`, `haptics`, `splash-screen` and `status-bar` —
**no photo-library plugin**. Nothing in the app can enumerate a camera roll, so
no manifest can ever be produced.

### What finishing it requires

1. **A media-library plugin.** `@capacitor/camera` only picks single images; a
   full camera-roll sync needs something like `@capawesome/capacitor-photo-editor`
   /`capacitor-plugin-media`, or a small custom plugin over `PHPhotoLibrary`
   (iOS) and `MediaStore` (Android). Choosing this is the first decision.
2. **A manifest builder** that maps device assets to the shape
   `validateNativeManifest` expects — `localId`, `kind`, `filename`, `size`,
   `createdAt`, `favorite`, `albumIds`, `confirmedPersonIds`, `checksum`.
   `favorite` and album membership are available from both platform APIs;
   `confirmedPersonIds` maps to platform face grouping where permitted.
3. **A checksum strategy.** The plan endpoint deduplicates on checksums, so the
   client must hash on device. Hashing large videos in JS is slow — this
   probably belongs in native code.
4. **Background upload.** iOS needs `BGProcessingTask` and a background URLSession;
   Android needs `WorkManager`. Capacitor's default WebView execution is
   suspended in background, so a JS-only loop will not survive.
5. **Permission strings and entitlements.**
   - iOS `Info.plist`: `NSPhotoLibraryUsageDescription`, plus the Background
     Modes capability.
   - Android: `READ_MEDIA_IMAGES` and `READ_MEDIA_VIDEO` (API 33+), falling back
     to `READ_EXTERNAL_STORAGE`, and a foreground-service type for long uploads.
   - Both stores review photo-library access; the usage string must say plainly
     that photos are uploaded to the user's own SnapNext library.
6. **Device verification.** Building and testing this needs Xcode and Android
   Studio on real hardware. It cannot be validated in CI.

Until steps 1–6 are done, `ios_photos` and `android_media` correctly report
`native_app_required` and the UI says the work happens in the mobile app. That
message is accurate — it is a description of where the feature will live, not a
claim that it is finished.

## Adding a new cloud

1. Add it to `lib/smart-sync/providers.js` with its `env`, `capabilities`,
   `syncStrategy`, `connectPath` and `description`.
2. Add an OAuth adapter in `lib/smart-sync/oauth-adapters.js`.
3. Implement list / normalise / download in `lib/smart-sync/provider-api.js`,
   returning the same normalised asset shape as the others.
4. Add its variables and callback URL to
   `docs/SMART_SYNC_PROVIDER_ENV_CHECKLIST.md`.
5. Nothing in the UI needs editing — both surfaces render the registry.

`tests/cloud-sync-provider-surface.test.mjs` checks that every web provider has
credentials, a connect path and a real adapter behind it, and that the browser
payload never carries environment variable names.

## Google Drive uses the Picker, not whole-Drive access

Drive requests `drive.file`, the per-file scope. It has no ability to list or
read a user's Drive; it can only reach files the user picked in Google's own
Picker window.

This is a deliberate compliance decision. `drive.readonly` — what this used to
request — is classified by Google as a **restricted scope** and requires an
annual third-party security assessment before it can be used outside testing
mode. The assessment is priced by external assessors, not Google, and takes
months. SnapNext only ever needs the files someone chooses, so the per-file
scope is both the honest request and the one with no audit attached.

Consequences:

- `/api/cloud/google-drive/files` returns **410** with `picker_required`.
  Nothing can list a Drive any more, by design.
- Selection happens client-side via Google Picker; the chosen file ids go to the
  existing import endpoint unchanged.
- `/api/cloud/google-drive/picker-token` hands the browser a short-lived
  access token scoped to `drive.file`. The refresh token never leaves the server.

### Extra configuration

| Variable | Purpose |
| :--- | :--- |
| `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY` | Browser API key for the Picker. Restrict it to your domain. |
| `GOOGLE_DRIVE_PROJECT_NUMBER` | Optional Picker `appId`. |

Without the API key the Picker reports that it is not configured rather than
failing silently.

## The feature is import, not sync

It is named "Import from Cloud" everywhere a user can see it. Nothing polls a
provider on a schedule on the user's behalf, so calling it sync would promise
background work that does not happen. Ongoing background sync remains a
possible paid feature later, with explicit consent and storage-limit
enforcement — see `SNAPNEXT_BLUEPRINT_V4.md`.
