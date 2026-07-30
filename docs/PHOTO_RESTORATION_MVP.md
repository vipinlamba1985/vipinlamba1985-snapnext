# Photo Restoration MVP

## Product promise

SnapNext restores a selected old photo while preserving the original. A completed result is reviewed first and saved only as a separate derived copy.

## Revenue model

Restoration Credits are prepaid consumables separate from included weekly AI capacity. Launch packs are configurable and default to 1 for US$0.99, 3 for US$2.49, and 10 for US$6.99. Premium repair and print preparation consumes two Restoration Credits.

The MVP sells USD packs on the web through one-time Stripe Checkout. Stripe balance-transaction net revenue is recognized in SnapNext's financial ledger when available; a percentage-plus-fixed-fee reserve is used only as a fallback. Web checkout remains hidden inside iOS and Android until native consumable purchases are implemented.

## Safety and cost controls

- Purchases remain paused until an HTTPS restoration provider, explicit result-host allowlist, Stripe webhook secret, and USD catalog are configured.
- Each paid job requires explicit approval.
- Restoration Credits are reserved atomically and released on failure.
- Only one restoration reservation can be active per account.
- Stale reservations are recovered after the configured TTL.
- Prepaid jobs bypass only the subscription AI wallet; the company Profit Guard remains mandatory.
- The default provider-cost ceiling is US$0.06 per job and provider execution is not automatically retried.
- Provider outputs must use credential-free HTTPS, resolve to public addresses, and match an approved output hostname.
- Provider result URLs and cost metadata stay server-side behind an authenticated SnapNext preview route.
- The original media record and object are never overwritten.
- Saving verifies storage quota, claims a save lease, removes orphaned storage after database failure, and creates a separate derived media object.
- Stripe webhook grants are idempotent and restoration refunds/disputes are isolated from subscription state.
- Refunds account for available, reserved, and already-used Restoration Credits without reactivating a revoked purchase on webhook replay.

## Required production configuration

- `BILLING_PROVIDER=stripe`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `ENHANCE_PHOTO_PROVIDER_URL`
- `ENHANCE_PHOTO_PROVIDER_KEY` when required
- `RESTORATION_OUTPUT_HOSTS`
- `RESTORATION_CURRENCY=usd`
- `AI_TASK_MAX_COST_PHOTO_RESTORE_USD=0.06`

## Rollout

Keep provider configuration absent to expose an activation state without selling packs. After provider contract and output-host verification, enable an internal web account first and validate purchase → verified webhook grant → restore → private preview → save → refund/dispute. Open to a small web cohort only after provider invoice reconciliation confirms the intended margin. Native purchases remain disabled until Apple and Google Play consumables are implemented.
