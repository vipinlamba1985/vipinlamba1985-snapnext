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

The provider must treat `requestId` as an idempotency key. SnapNext does not automatically retry paid restoration execution in the MVP, but idempotency remains mandatory for network ambiguity and future durable-job recovery.

The provider must return JSON containing:

- `outputUrl`: credential-free HTTPS URL on an approved `RESTORATION_OUTPUT_HOSTS` hostname
- `jobId` or `id` when available
- `status`
- `provider`
- `model`
- `actualCostUsd` or `usage.costUsd` when available
- `usage` when available
- `outputExpiresAt` when applicable

The output host must resolve only to public addresses. The output must be JPEG, PNG, or WebP and remain within `RESTORATION_MAX_OUTPUT_MB`. Raw result URLs are stored server-side and exposed to the user only through an authenticated SnapNext preview route. SnapNext downloads the output again only after the user chooses Save, verifies storage capacity, claims a save lease, and stores a separate derived media object. Provider URLs that are non-HTTPS, credential-bearing, private-network, unapproved, redirected, empty, oversized, or non-image are rejected.
