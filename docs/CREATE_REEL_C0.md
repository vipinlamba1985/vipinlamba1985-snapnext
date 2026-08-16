# Create / Reel C0 — Canonical Export Foundation

**Status:** implementation gate for Create V2.1

C0 exists to make canonical Reel export bounded, deterministic, deletion-safe, and economically enforceable before SnapNext ships a server MP4 renderer.

## 1. Cost and quota contract

A local/device preview does not consume a canonical render quota. A new server-rendered canonical MP4 does.

Initial monthly new-render limits:

| Plan | New canonical Reel renders / month |
|---|---:|
| Free | 1 |
| Starter | 3 |
| Plus | 10 |
| Pro | 30 |
| Family | 50 |
| Super User | Unlimited |

These are conservative launch ceilings, not permanent marketing promises. Raise them only after measuring renderer compute, memory, output size, storage, and egress.

### Cache identity

The canonical manifest is normalized and SHA-256 hashed. Artifact identity is user-scoped, while the storage key includes the manifest hash.

The hash includes:

- `manifestVersion`
- `renderContractVersion`
- `rendererOutputVersion`
- canonical scenes and source content hashes
- soundtrack content hash and sync parameters

Same user + same manifest hash + verified `ready` artifact is a cache hit and returns the existing artifact. A cache hit does **not** reserve or consume a new render quota and does **not** create new render spend.

### Company margin authority

Canonical rendering is zero-credit to the user only when the product surface says so; it is never zero-cost to SnapNext by assumption.

The renderer must supply a positive estimated render cost before work can start. AI and other metered product work reserve against one shared monthly Profit Guard budget. Shared reservations are atomically bounded in `metered_work_budget_months`; AI and product-specific reservations reference the shared reservation.

Render spend is therefore blockable. `product_cost_ledger` is not reporting-only.

## 2. Preview/export fidelity contract

Preview and exporter consume the same canonical manifest. The exporter must not independently re-derive user decisions.

### Canonical — must match

- source media and scene order
- scene duration
- crop / focal point / framing
- video in and out points
- text content, layout, alignment and chosen font/style parameters
- transition type and timing
- selected visual/filter parameters
- soundtrack ID, content hash, trim and sync offset
- total duration
- aspect ratio

### Cosmetic — may differ

- encoder quality / bitrate
- sub-pixel font rasterization and anti-aliasing
- hardware-specific interpolation precision
- tiny easing interpolation differences that do not change canonical timing

A material output behavior change increments `rendererOutputVersion` so an old cached MP4 cannot satisfy a new output contract.

## 3. Manifest versioning

C0 starts with:

- `manifestVersion: 1`
- `renderContractVersion: 1`
- `rendererOutputVersion: 1`

Existing stored projects remain pinned to their manifest version. Opening an old project uses a version adapter. Editing/remixing an old project creates a new revision in the current manifest schema; SnapNext does not silently overwrite historical project manifests.

## 4. Render artifact lifecycle

Canonical artifacts use these states:

1. `rendering`
2. `pending_validation`
3. `ready`

Failure/invalidation states:

- `failed`
- `stale_source`
- `deletion_failed`

The render output is not addressable as a completed user artifact until it reaches `ready`.

## 5. Deletion generation and concurrency

Ordinary media deletion has a user-level `mediaDeletionGeneration`, separate from face-recognition deletion state.

Before permanent media deletion begins, SnapNext increments that generation. A canonical render stamps the current generation at start.

Before publication, the worker verifies:

- generation still matches
- every source media row still exists and belongs to the user
- source is not trashed
- source content hash still matches the manifest

After the conditional move to `ready`, generation is checked again. If deletion moved during the race, the output is strictly deleted and the artifact becomes `stale_source`.

Permanent source deletion also invalidates matching `rendering`, `pending_validation`, and `ready` derived artifacts. If a controlled derived artifact cannot be removed, permanent deletion fails closed instead of claiming verified cleanup.

The following permanent media-deletion paths route through the same coordinator:

- single Library delete
- bulk Library delete
- retention-based Trash purge
- account deletion

## 6. Export boundary

SnapNext can verify deletion only for data and derived artifacts it controls.

Required export notice:

> Copies saved or shared outside SnapNext are controlled by the destination and cannot be deleted by SnapNext.

Camera Roll, local filesystem, WhatsApp, Instagram, another person's device, and other external destinations are outside SnapNext's deletion guarantee after export.

## 7. Soundtrack export eligibility

A track is not eligible for MP4 embedding merely because it is described as free or commercially usable.

The audio catalog must explicitly record at least:

- license and version
- evidence/source URL
- attribution requirement
- commercial-use allowance
- embedded audiovisual export allowance
- derivative/synchronization allowance
- redistribution scope
- territories
- expiry, if any
- variable licensing cost

The current CC0 soundtrack is marked eligible for embedded audiovisual export. Future tracks fail closed unless the required rights are explicit.

## 8. Billing copy for Create V2.1

Create V2.1 remains credit-neutral in user-facing terminology while Restoration has its separate credit model.

Use copy such as:

- `Included with your plan`
- `1 of 3 Reel exports used this month`

Do not introduce `SnapNext Credits` in Create until the separate billing-consolidation sprint intentionally unifies the models.

## 9. What C0 does not claim

C0 builds the contracts, quota/margin gates, deterministic artifact identity, source verification, and deletion-safe lifecycle. It does **not** by itself mean a production H.264/AAC MP4 renderer, job queue, Create editor UI, or physical-device export QA has shipped.

Those components may proceed only on top of this foundation and must preserve these gates.
