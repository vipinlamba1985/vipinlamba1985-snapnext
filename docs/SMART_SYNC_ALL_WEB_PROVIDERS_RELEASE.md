# Smart Sync all web providers release

This release completes the web-provider implementation layer for Google Drive, Google Photos Picker, Dropbox, and Microsoft OneDrive.

## Included

- Shared provider-neutral inventory, priority selection, duplicate, capacity, storage, and verification pipeline.
- Dropbox recursive discovery and durable `list_folder/continue` cursors.
- OneDrive Microsoft Graph delta discovery and durable delta links.
- Google Photos user-selected Picker sessions with polling, durable imports, and session cleanup.
- OAuth refresh-token handling with encrypted token storage and read-only scopes.
- Shared job dispatch, leases, checkpoints, pause/resume/retry/stop, and daily cron continuation.
- Safe provider disconnect, account deletion cleanup, private Picker session identifiers, and strong-hash duplicate rules.
- Updated Smart Sync interface, setup documentation, environment checklist, QA checklist, and regression tests.

## External activation requirement

Provider-issued OAuth credentials and exact production callback URLs must be configured in Vercel before a provider can display as available. Those secrets are external configuration and are never stored in the repository.

## Native status

iOS and Android server contracts remain available, but camera-roll enumeration and operating-system background upload require signed native application builds and are not represented as web capabilities.
