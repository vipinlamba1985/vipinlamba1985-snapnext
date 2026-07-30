# Photo Restoration Provider Contract

SnapNext sends a JSON POST request to `ENHANCE_PHOTO_PROVIDER_URL` with:

- `requestId`
- `action`
- `recipeId`
- `prompt`
- `imageBase64`
- `mimeType`
- `preserveIdentity: true`
- `preserveOriginal: true`
- `prohibitInventedContent: true`

The provider must return JSON containing:

- `outputUrl`: HTTPS URL on an approved `RESTORATION_OUTPUT_HOSTS` hostname
- `jobId` or `id` when available
- `status`
- `provider`
- `model`
- `actualCostUsd` or `usage.costUsd` when available
- `usage` when available
- `outputExpiresAt` when applicable

The output must be JPEG, PNG, or WebP and within `RESTORATION_MAX_OUTPUT_MB`. SnapNext downloads it only after the user chooses Save, verifies storage capacity, and stores a separate derived media object. Provider URLs that are non-HTTPS, private-network, unapproved, redirected, empty, oversized, or non-image are rejected.
