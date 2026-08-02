# Face indexing: why the crowd-photo cost was left in place

A record of a decision **not** to change something, so the reasoning is
available when someone revisits it with better information than I had.

## The waste is real

`indexMediaFaces` calls Rekognition `IndexFaces` on every eligible photo,
including crowd shots, with `MaxFaces: 30`. **After** the call returns, photos
with more than `MAX_FAMILY_SIZED_FACE_COUNT` (4) usable faces are marked
`group_photo` and excluded from clustering — they never create or strengthen an
identity.

So a 30-person wedding photo costs one API call and writes up to 30 face vectors
into the collection. Those vectors are billed as storage every month, forever,
for faces the system has already decided never to use for identity.

`DeleteFaces` is in the permitted action list (`people-rekognition-capabilities.js`)
and is never called anywhere.

## Why it was not "fixed"

The obvious change — delete crowd vectors after classifying — would cut a
recurring cost. It was not made, for three reasons.

**It is not verifiable here.** There is no AWS access in this environment, so a
change to the indexing path could not be run even once. Face recognition is a
working pipeline that spends money in production. A wrong change does not
degrade gracefully; it breaks People for everyone, which is far more expensive
than the storage it would save.

**It destroys a feature the product owner asked for.** The stated goal was that
once someone is made an active person, their face should surface in the group
photos they appear in. That match needs those vectors. Deleting them makes the
feature permanently impossible without re-indexing the whole library — which
costs far more than the storage ever did.

**The saving is smaller than the risk.** Rekognition face storage is roughly
$0.00001 per face per month. A library with 2,000 crowd shots averaging 10
usable faces stores 20,000 vectors — about **$0.20 per user per month**. Real at
scale, but not urgent enough to justify an unverifiable change to a working
money-spending pipeline.

## What to do instead, when someone picks this up

The two options are mutually exclusive per photo:

- **A — delete crowd vectors.** Cheapest. Group photos can never be attributed
  to a person afterwards.
- **B — keep them, match on activation.** When a person becomes active, run
  `SearchFaces` (face-id based, already permitted, cheaper than
  `SearchFacesByImage`) against stored group-photo face ids and attach matches.
  Cost is bounded by the number of active people, which is already plan-gated,
  and is paid on an explicit user action rather than on every upload.

**B is the one that matches the product intent**, and its cost is bounded and
user-triggered — the same shape as the smart-search guards. A middle path exists:
keep vectors only for crowd shots that already contain an active person, and
delete the rest.

Whichever is chosen, it needs a real AWS account to verify, and it should ship
behind a flag with the existing behaviour as the fallback.

## What already works, and should not be re-implemented

- Large group photos are already excluded from creating identities, at index
  time, before any cluster write.
- Magic Library already has both a `Best of {person}` section and a separate
  `Group photos with {person}` section.
- `bestEligible` already promotes a large group photo into the best pool when it
  contains another active person (`people-gallery-rules.js`).

Much of the intended behaviour is built. The open part is cost, not capability.
