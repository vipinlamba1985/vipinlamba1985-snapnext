# Photo Restoration MVP

## Product promise

SnapNext restores a selected old photo while preserving the original. A completed result is reviewed first and saved only as a separate derived copy.

## Revenue model

Restoration Credits are prepaid consumables separate from included weekly AI capacity. Launch packs are configurable and default to 1 for US$0.99, 3 for US$2.49, and 10 for US$6.99. Premium repair and print preparation consumes two Restoration Credits.

## Safety and cost controls

- Purchases remain paused until a restoration provider is configured.
- Each paid job requires explicit approval.
- Restoration Credits are reserved atomically and released on failure.
- Prepaid jobs bypass only the subscription AI wallet; the company Profit Guard remains mandatory.
- Provider outputs must use HTTPS and an approved output hostname.
- The original media record and object are never overwritten.
- Saving verifies storage quota and creates a separate derived media object.
- Stripe webhook grants are idempotent and restoration refunds/disputes are isolated from subscription state.

## Required production configuration

- `BILLING_PROVIDER=stripe`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `ENHANCE_PHOTO_PROVIDER_URL`
- `ENHANCE_PHOTO_PROVIDER_KEY` when required
- `RESTORATION_OUTPUT_HOSTS`
- `AI_TASK_MAX_COST_PHOTO_RESTORE_USD`

## Rollout

Keep provider configuration absent to expose an activation state without selling packs. After provider contract and output-host verification, enable an internal account first, validate purchase → grant → restore → save → refund, then open to a small cohort.
