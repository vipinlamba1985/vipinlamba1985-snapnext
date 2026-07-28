# Smart Sync web provider QA

Use a dedicated test account and small source folders before testing large libraries.

## Shared checks

1. Sign in to SnapNext and open **You → Backup & Sync → Smart Sync**.
2. Confirm a disconnected provider never appears connected.
3. Connect with the documented read-only scopes.
4. Start with **Understand my library** and confirm no protected `media` record is created for indexed-only items.
5. Run **Protect important memories** and confirm only eligible priority items are copied.
6. Run **Protect everything that fits** with limited storage and confirm the job pauses before exceeding capacity.
7. Confirm exact duplicates are skipped.
8. Pause, reload, resume, and confirm the cursor continues from the stored checkpoint.
9. Disconnect and confirm active jobs stop while protected SnapNext memories remain available.
10. Confirm changing a plan requires fresh approval.

## Google Drive

- Connect through `/imports`.
- Confirm initial discovery completes and a Drive change cursor is stored.
- Add or change one source item, run again, and confirm only changes are discovered.

## Dropbox

- Confirm the authorization screen requests only metadata and content read permissions.
- Test a nested folder to verify recursive discovery.
- Add, rename, and delete one source item, then verify `list_folder/continue` detects each change.
- Confirm a deleted source never deletes an already protected SnapNext memory.

## OneDrive

- Confirm the authorization screen requests `Files.Read` and `offline_access` only.
- Test nested folders and a mixture of photos and videos.
- Add, modify, and delete one source item, then verify the saved Graph delta link detects each change.
- Confirm QuickXor and CRC values never skip SnapNext SHA-256 verification for cross-file duplicates.

## Google Photos

- Connect Google Photos.
- Choose a small selection in the Google-hosted Picker window.
- Confirm the Picker window closes after **Done** and SnapNext creates one durable import job.
- Confirm selected items are copied before temporary base URLs expire.
- Confirm the Picker session is deleted after successful indexing/import.
- Confirm **Understand my library** indexes only explicitly selected items and copies no originals.
- Start another selection and confirm a fresh Picker session is created.

## Failure checks

- Revoke provider access and verify the next run requests reconnection without exposing tokens.
- Expire or remove credentials in a non-production test environment and confirm the provider becomes unavailable rather than failing the Smart Sync page.
- Simulate a failed download and confirm the cloud asset is marked for attention, not protected.
- Simulate storage failure and confirm the item is not marked **Safe in SnapNext**.

## Acceptance

A provider is accepted only after OAuth, first discovery, incremental discovery, one protected copy, duplicate handling, capacity handling, pause/resume, disconnect, and source deletion have all been verified with a real account.
