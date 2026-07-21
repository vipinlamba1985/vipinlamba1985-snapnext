# Native Smart Sync permissions and client contract

## User choices

The native app must present three clear choices:

1. **Choose photos manually** — use the operating-system picker or selected/limited library access.
2. **Back up automatically** — request full photo-library access only after the user enables automatic Smart Sync.
3. **Not now** — continue using SnapNext without device sync.

## iOS client

- Use PhotoKit authorization for read/write library access.
- Limited access is accepted for manual uploads.
- Full authorization is required before registering `backgroundUploadAvailable: true` for automatic backup.
- The permission message must state that SnapNext copies approved photos and videos and never deletes originals.
- Register the authorized device with `POST /api/smart-sync/native/device`.
- Send manifests of at most 500 assets to `POST /api/smart-sync/native/plan`.
- Upload only assets returned in the approved plan, in resumable batches of 10.

Recommended Info.plist descriptions:

- `NSPhotoLibraryUsageDescription`: "SnapNext uses the photos and videos you approve to create your private backup and memories. Originals are never changed or deleted."
- `NSPhotoLibraryAddUsageDescription`: omit unless SnapNext later saves generated media back to Photos.

## Android client

- Prefer the Android system Photo Picker for manual selection; it does not require broad storage permission.
- For automatic library backup, request the applicable image/video media permissions and support Android 14 Selected Photos Access.
- Treat selected-photo access as manual/limited mode; require full access before enabling automatic backup.
- Register the authorized device and use the same manifest/plan/batch flow as iOS.

## Server registration payload

```json
{
  "provider": "ios_photos",
  "deviceId": "stable-install-id",
  "name": "Vipin's iPhone",
  "authorized": true,
  "permission": "limited",
  "backgroundUploadAvailable": false,
  "appVersion": "1.0.0"
}
```

For automatic backup, `permission` must be `full` and `backgroundUploadAvailable` must be `true`. The server rejects automatic plans that do not meet both requirements but continues to allow manual uploads.
