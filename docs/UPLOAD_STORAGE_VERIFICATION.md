# Upload storage verification

SnapNext must not mark a memory as safely backed up until the storage provider confirms the object exists with the expected size and content type.

Required flow:

1. Validate the file type and size before upload.
2. Save the object to the configured provider.
3. Verify the stored object metadata server-side.
4. Insert the media document only after verification succeeds.
5. Delete the stored object if database persistence fails.
6. Never simulate successful cloud backup in production.

This document is the acceptance contract for the upload-integrity implementation series.
