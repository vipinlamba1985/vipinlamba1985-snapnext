# Library structure, trusted circle, and creative billing

Why the Library, Magic Library and "Favourites" are arranged the way they are.
Read this before moving anything between them.

## The problem this replaced

Three surfaces meant "everything I own" and one word meant two different things:

- `/gallery` redirected straight to `/magic-library`, so the plain grid of
  everything was unreachable. Library and Magic Library felt like one
  overlapping place with no boundary a user could describe.
- `/magic-library/all` and `/gallery/classic` were two more doors into roughly
  the same room.
- "Favourites" meant both *the people you share with* (`/favorites`, labelled
  "Trusted people", with invite/accept/block and per-person permissions) and
  *a photo you starred* (`media.favorite`).

## Three concepts, three names

| Concept | Where | What it is |
|---|---|---|
| **Library — All** | `/gallery` | Everything backed up, newest first, grouped by day. Never plan-gated. |
| **Library — Magic** | `/gallery/magic` | The same photos organised by person. Gated on active people. |
| **Trusted circle** | `/trusted-circle` | The people you share with, and what each may see. |
| **Starred** | `media.favorite` | A photo you marked. A filter inside All. |

The rule that keeps them apart: **All is where photos live. Magic is how you
find them. Trusted circle is who sees them. Starred is what you marked.**

Magic is a *lens over* the library, which is why it lives under `/gallery`
rather than at its own top-level route. Organising by person belongs to Magic
only — reintroducing a "People" filter into All is what blurred them last time.

`tests/library-tabs-separation.test.mjs` and
`tests/trusted-circle-naming-separation.test.mjs` enforce all of this.

### Redirects kept for old links

`/magic-library`, `/magic-library/all`, `/gallery/classic` and `/favorites` all
redirect. `/favorites` matters most: invitation emails already sent point there.

### Names that deliberately did not change

The MongoDB collections `favorites` and `favorite_permissions`, and the stored
notification types `favorite_request` / `favorite_accepted`, keep their historical
names so existing documents stay readable. In code the concept is always
"trusted circle". Renaming them would be a data migration with no user-visible
benefit.

## Triage (`/gallery/cleanup`)

Answers "what can I safely delete?" for a large library, from metadata alone:
content hash, byte size, filename, capture date, starred flag. `lib/triage.js`
has no imports, so it cannot reach a model and costs nothing to run.

Buckets, in order of confidence: exact duplicates → already in Trash → large
videos → old screenshots → old and never starred.

Two invariants the tests pin:

- A **starred copy is never** the one proposed for removal.
- A file appears in **exactly one bucket**. A duplicated, oversized, year-old
  video would otherwise promise its bytes back three times over.

The last bucket is named for what SnapNext actually knows. There is no view
tracking, so it does not claim these went unopened. If per-item view tracking is
ever added, that bucket can become a real "unused" signal — until then the name
stays honest.

Cleanup moves items to **Trash, not deletion**. Permanent deletion stays an
explicit second step.

## Trip sharing

Trips are runs of photos taken close together, split by a long gap or a known
change of place. `lib/trip-sharing.js` is pure — no database, no network, no
model — so suggestions cost nothing to produce.

Sharing stays explicit and approval-gated:

- `GET /api/trip-sharing` **only drafts**. It never shares.
- A suggestion is drafted only when the recipient is an accepted member of the
  trusted circle **and** the owner's `shareSharedPhotos` permission for them is
  on. A missing or unknown permission is treated as **no**, never a default yes.
- Photos already shared with that person are never offered again.
- Approval names a specific person and an exact set of photos, and re-verifies
  trust and permission server-side rather than believing the client.

Where enrichment has already tagged faces, a trusted person appearing in the
trip ranks their suggestion higher. Those names are *read*, never computed — no
recognition is triggered to build a suggestion.

## Creative billing

`lib/creative-credits.js` is the single declaration of how each creative feature
is paid for:

| Mode | Meaning |
|---|---|
| `included_free` | Deterministic output from data the user already owns. No provider call, no credits, any plan. |
| `ai_credits` | Calls an external model. **Must** reserve through `lib/ai-spend-gate.js` (via `lib/ai/gateway.js`), then settle or release. |
| `prepaid_credits` | Paid up front with its own pack; never touches the weekly plan allowance. |

Today: captions, hashtags and emojis are `included_free` (built by
`lib/post-composer.js` from the user's own tags and caption wording); photo
enhancement is `ai_credits` and already refuses to start until the user has
approved the price; restoration is `prepaid_credits`.

Both halves of the rule matter. Silent spend is how a free tier becomes
expensive — and charging credits for a template is how users stop trusting the
meter. `tests/creative-credit-policy.test.mjs` enforces both directions.

**If any free feature becomes a real model call**, it must change `billing` to
`ai_credits`, declare a non-zero cost, and go through the gateway. The test will
fail until it does.
