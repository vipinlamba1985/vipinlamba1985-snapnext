# SnapNext Blueprint v4 — Ideology and Build Doctrine

> **Every Memory. Every Story. Forever.** — the promise.
> This document is *how we are allowed to keep it.*

This is the working constitution for SnapNext. It exists to be **followed while
coding**, not admired. If you are adding a feature, changing a name, or spending
a credit, the rules here apply and reviewers will cite them by number.

---

## 0. The Honesty Rule (read this first)

SnapNext already has two large vision documents —
`SNAPNEXT_MASTER_ENGINEERING_BIBLE.md` and `SNAPNEXT_V3_SOURCE_OF_TRUTH.md`.
They describe an ambition. They do **not** reliably describe the shipped product,
and `CLAUDE.md` warns you to cross-check them against code before relying on them.

That drift is the failure mode this document is built to resist.

**Every claim below is marked, and the marking is part of the claim:**

| Mark | Meaning |
| :--- | :--- |
| ✅ **Enforced** | Built, and a test fails if someone undoes it. The test is named. |
| 🟢 **Built** | Shipped and working, but nothing structurally prevents regression. |
| 🧭 **Direction** | Agreed intent. Not built. Do not describe it to users as if it were. |
| ⛔ **Refused** | Deliberately not built, with the reason. Re-open only with new facts. |

**If you ship something from 🧭, move it up and name the test. If you find a ✅
whose test no longer exists, that is a bug in this document — fix it in the same
PR.** A blueprint that quietly outranks reality is worse than no blueprint.

---

## 1. What SnapNext is

A **memory-first, private photo home**. Not cloud storage with a nice skin, and
not a social network.

Three sentences that decide most arguments:

1. Storage is the floor, not the product. Anyone can hold bytes; SnapNext is
   judged on whether you can *find and feel* what is in them.
2. The library belongs to the user, completely, on every plan. Intelligence is
   what we sell — never access to your own photos.
3. Nothing leaves your library without you saying so, each time.

### Who we build for first

When a decision splits, the **person with 10,000 unsorted photos and no system**
wins. Not the power user, not the photographer, not the enterprise. They are the
reason Magic Library, triage and search exist at all.

---

## 2. The Ten Principles

These emerged from real defects in this codebase, not from a whiteboard. Each
one is followed by the failure that produced it.

### P1 — One concept, one name, one home. ✅
*Enforced by `tests/trusted-circle-naming-separation.test.mjs`,
`tests/library-tabs-separation.test.mjs`.*

A word means exactly one thing. A thing lives in exactly one place.

> **The failure:** "Favourites" meant both *the people you share with* and *a
> photo you starred*. Separately, three routes (`/gallery`, `/magic-library/all`,
> `/gallery/classic`) all meant "everything I own", and `/gallery` silently
> redirected away from itself so the plain library was unreachable.

Before adding a surface, ask which existing one it duplicates. If the honest
answer is "sort of, but different", you are about to repeat this.

### P2 — Completeness is never gated. ✅
*Enforced by `tests/library-tabs-separation.test.mjs`.*

Every user, on every plan including free, can always see **everything they own**,
newest first. Plan limits apply to *lenses over* the library — never to the
library itself.

Magic Library is gated on active people. The All view is not, and must never
import an entitlement check.

### P3 — Prefer metadata to inference. ✅
*Enforced by `tests/triage-plan.test.mjs`, `tests/trip-sharing.test.mjs`,
`tests/creative-credit-policy.test.mjs`.*

If a feature can be built from data that already arrived with the upload —
content hash, byte size, filename, capture time, existing tags — build it that
way. Do not call a model to compute something arithmetic can answer.

`lib/triage.js`, `lib/trip-sharing.js` and `lib/post-composer.js` have **zero
imports**. That is not an accident and not a style choice: a module with no
imports cannot reach a provider, so its cost is provably zero at any library
size. Keep them that way.

> This is the single biggest lever on margin. A feature that costs nothing to run
> can be given away, and giving it away is what makes the paid tier credible.

### P4 — Propose, never perform. ✅
*Enforced by `tests/trip-sharing.test.mjs`.*

SnapNext prepares; the user decides. Anything that leaves the library, deletes
data, or changes who can see what requires a deliberate human act.

- Trip sharing drafts suggestions. `GET` never shares.
- Cleanup moves to Trash. It never deletes.
- Enhancement refuses to start until the price has been shown and approved.

"Automatically" is a word to be suspicious of in a spec. Automatic *preparation*
is the product. Automatic *action* is a bug.

### P5 — Name a feature for what it actually knows. ✅
*Enforced by `tests/triage-plan.test.mjs`.*

Do not let a label imply knowledge the system does not have.

> **The failure avoided:** the obvious name for a cleanup bucket was "Unused
> photos". SnapNext has no view tracking — it cannot know that. The bucket is
> called **"Old and never starred"**, which is exactly what it checked.

If per-item view tracking is ever added, that bucket earns the better name. Until
then the smaller, true claim stands.

### P6 — Declare the price before the click. ✅
*Enforced by `tests/creative-credit-policy.test.mjs`.*

Every creative feature declares its billing in `lib/creative-credits.js`:

| Mode | Rule |
| :--- | :--- |
| `included_free` | Deterministic output from data the user owns. No provider call, no credits, any plan. |
| `ai_credits` | Calls an external model. **Must** reserve via `lib/ai-spend-gate.js` (normally through `lib/ai/gateway.js`), then settle or release. |
| `prepaid_credits` | Paid up front with its own pack. Never touches the weekly allowance. |

Both directions are enforced. Silent spend is how a free tier becomes ruinous —
**and charging credits for a template is how users stop trusting the meter.** A
free feature that fakes a charge fails this test just as hard as an ungated one.

### P7 — Reversible by default. 🟢

Prefer the undoable version of every destructive act. Trash before delete.
Revocable permissions before permanent grants. A confirmation the user can back
out of before a one-way door.

Where an action genuinely cannot be undone, say so plainly at the moment of
choice — not in a help article.

### P8 — Fail closed on permission. ✅
*Enforced by `tests/trip-sharing.test.mjs`.*

Absence of permission is **denial**, never a default yes. A missing record, an
unknown key, an unreadable value — all mean no.

Authorization is re-verified **server-side at the moment of action**, never
trusted from what the client posted back. A suggestion generated an hour ago
proves nothing about permission now.

### P9 — Originals are sacred. 🟢

An imported original is never modified in place and never overwritten.
Enhancement and restoration produce *new* results alongside the original.
Nothing in the product may make a user's only copy worse.

### P10 — Encode ideology in tests, not prose. ✅
*This is the meta-principle, and the reason this document is different from the
two that preceded it.*

A rule written only in Markdown decays at the speed of the next deadline. A rule
written as a test survives.

When you add a principle here, add the test that enforces it. Structural tests
are cheap and specific — reading a route file to assert it authenticates, or
asserting a module has no imports, costs milliseconds and catches whole classes
of regression:

```js
// The concept must stay unmerged.
assert.equal(normalizeMediaFilter('trusted-circle'), 'all');

// The module must stay incapable of spending money.
assert.doesNotMatch(source, /^import /m);

// GET must never share.
assert.doesNotMatch(getHandler, /approveTripShare/);
```

---

## 3. The Four Concepts

The structural core of the product. Confusing any two of these is the most
expensive mistake available. ✅ *Enforced.*

| Concept | Route | What it is |
| :--- | :--- | :--- |
| **Library — All** | `/gallery` | Everything you own, newest first, grouped by day. Never gated. |
| **Library — Magic** | `/gallery/magic` | The same photos, organised by person. Gated on active people. |
| **Trusted circle** | `/trusted-circle` | The people you share with, and what each may see. |
| **Starred** | `media.favorite` | A photo you marked. A filter inside All. |

> **All is where photos live.
> Magic is how you find them.
> Trusted circle is who sees them.
> Starred is what you marked.**

Magic is a **lens over** the library — not a folder inside it, not a second
library. That is why it lives under `/gallery`. Organising by person belongs to
Magic alone; reintroducing a "People" filter into All is precisely what blurred
them together before.

Full detail, including the redirects kept for old links and the collection names
deliberately left alone: **`docs/LIBRARY_STRUCTURE.md`**.

### Navigation — settled ✅
*Enforced by `tests/primary-navigation.test.mjs`.*

Primary navigation is exactly five items:

**Home · Library · Add · Create · You**

This was contradictory three ways — `CONTRIBUTING.md` mandated *Home, Vault,
Stories, Create, People*, the app shipped the names above, and a third shape was
under discussion. The shipped names won, because they are what users are actually
looking at and because renaming navigation is a migration with no user benefit.
`CLAUDE.md` and `CONTRIBUTING.md` were corrected to match.

The rule and the code are now tested against each other, so this is settled
rather than merely written down. **Do not re-open it in a feature PR.** Changing
navigation is its own change, with its own reasoning, and it updates the test in
the same commit.

Everything else reachable from the app lives under "More" (`MORE_HREFS`). A new
destination goes there, never into the primary five — the count is the point (P1).

---

## 4. Build doctrine — adding a feature

Work top to bottom. Stop at the first line that answers the question.

1. **Does it duplicate an existing surface?** (P1) If yes, extend that surface.
2. **Can it run on metadata alone?** (P3) If yes, it must — with no imports, so
   the zero-cost guarantee is structural rather than promised.
3. **Does it act, or propose?** (P4) Acting on the user's behalf needs an
   explicit approval step and a server-side re-check (P8).
4. **Does it call a model?** (P6) Then declare `ai_credits`, reserve before,
   settle or release after. No exceptions, no "just this once for the demo".
5. **Is the name honest?** (P5) Does the label claim knowledge the code has?
6. **Is it reversible?** (P7) If not, is that visible at the moment of choice?
7. **Which test locks it in?** (P10) Name it in the PR.

### Reuse before building

Established abstractions, in the order you should reach for them:

| Need | Use |
| :--- | :--- |
| Storage | `lib/storage.js` |
| Auth | `lib/auth.js`, `lib/supabase.js` |
| Plans / entitlements | `lib/plans.js`, `lib/entitlements.js` |
| AI spend | `lib/ai/gateway.js` → `lib/ai-spend-gate.js` |
| Creative billing | `lib/creative-credits.js` |
| Sharing permissions | `lib/trusted-circle/links.js` |
| Notifications | `lib/notify.js` |
| UI primitives | `components/ui/*` (shadcn) |

Adding a parallel system beside one of these needs a written reason in the PR.

---

## 5. Where v4 stands today

### Built and structurally enforced ✅
- The Four Concepts, separated and locked (§3).
- **Library All/Magic tabs** — one library, two views, redirects for every old
  entry point.
- **Trusted circle** — invite / accept / decline / block, five per-person
  permissions, future-sharing off by default. Exactly one authorization path.
- **Triage** (`/gallery/cleanup`) — duplicates, Trash, large videos, old
  screenshots, old-and-never-starred. Zero AI. A starred copy is never proposed
  for removal; a file appears in exactly one bucket.
- **Trip sharing** — metadata trip detection, approval-only, fail-closed on
  permission, never re-offers what was already shared.
- **Creative billing** — every feature declares its mode; free means free.

### Built, not yet locked 🟢
- Magic Library people recognition, activation and plan limits.
- Photo enhancement (metered, approval-gated) and restoration (prepaid credits).
- Smart Sync connectors, chat E2EE, Circles, Family, Stripe billing.
- Ready to Post composition (caption / hashtags / emojis, all free).

### Direction 🧭
- **Instant search at scale** — a real metadata index rather than regex scan, so
  a 10k library searches in milliseconds. Must stay zero-AI (P3).
- **View tracking** — would let "Old and never starred" become a truthful
  "Unused" (P5), and make triage far sharper.
- **Trip sharing round trip** — today the owner offers; the natural completion is
  a recipient asking "were there photos of me?", still approval-gated (P4).
- **Perceptual near-duplicate detection** — hash catches byte-identical copies;
  burst shots of the same moment need more. Must not become a per-photo model
  call (P3).
- **Shared trip albums** — a trip approved by both sides becoming one album.
- **Circle activity feed** — the descoped, buildable half of the refused external
  social feed (see ⛔ below). Same interface — a short list of what is new since
  you last looked — but fed only by sources SnapNext controls and can honour:
  photos a trusted person shared with you, trip suggestions awaiting your
  approval, occasion reminders drawn from your own capture dates, and people
  newly recognised in your library. No third-party grant is required, so it can
  actually ship. It must stay metadata-only (P3) and must not become a place
  where anything shares itself (P4).

### Refused ⛔
- **External social activity feed** — friends' Instagram / LinkedIn / YouTube
  posts shown inside SnapNext ("4 pictures by @friend, 3 LinkedIn posts, 1
  YouTube video").

  This requires read access to *other people's* feeds. Instagram Basic Display
  is deprecated, and neither Meta nor LinkedIn grants generic friend-content
  access to third parties. **This is a permissions limit, not a difficulty
  one** — no amount of engineering earns the grant, so building toward it means
  promising users a feature that cannot ship.

  Do not accept a partial version either: OAuth that reads *the signed-in user's
  own* posts is available, but it does not produce a friends' feed, and shipping
  it under that name would misrepresent what the user is looking at (P5).

  **The half worth building is in 🧭 Direction above as "Circle activity feed"** —
  the same interface, fed by sources we control and can honour.
- **Public sharing, likes, follower counts, algorithmic ranking.** SnapNext is
  introspective by design. There is no metric to perform for.
- **Training general models on user photos.** Not now, not opt-out, not
  anonymised. This is the privacy promise; it has no exception clause.
- **Auto-sharing anything**, however confident the signal (P4).

---

## 6. Product voice

- Plain human language. No prompt engineering required, ever — if a feature needs
  the user to phrase something cleverly, the feature is unfinished.
- Say the smaller true thing over the larger vague one (P5).
- Never claim a security, encryption or compliance control that is not
  implemented and verified.
- Errors state what happened and what remains available. "Your weekly AI
  allowance has been used. It resets next week, and your saved memories remain
  available." — not "Error 429".
- Empty states are a first-class design surface, not an afterthought.

---

## 7. Amending this document

This file changes with the code, in the same PR, or it starts lying.

- Promote 🧭 → 🟢 → ✅ as things get built and locked down. Name the test.
- Moving something **down** a level, or into ⛔, needs the reason written next to
  it. Future readers need to know it was decided, not forgotten.
- Adding a principle means adding its test (P10).
- A ✅ whose test no longer exists is a defect in this document — fix it
  immediately.

Related: `CLAUDE.md` (working rules), `CONTRIBUTING.md` (contribution rules),
`docs/LIBRARY_STRUCTURE.md` (the Four Concepts in detail),
`docs/ARCHITECTURE.md`. The v3 and Bible documents remain useful for long-range
product imagination — read them as ambition, and this document as the contract.
