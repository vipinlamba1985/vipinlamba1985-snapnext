# SnapNext UX Implementation Brief

**Repository:** `vipinlamba1985/vipinlamba1985-snapnext`  
**Branch:** `preview/complete-app-ux-v2`  
**Target framework:** existing Next.js app (App Router or Pages Router — do not change)  
**Purpose:** a controlled UX/UI polish of the authenticated SnapNext application.

> This brief is derived from a mobile UX blueprint prototype. **Do not copy the Expo/React Native code from the blueprint** — this is a Next.js codebase. Re-implement the equivalent patterns in your existing components, routes, and styling system.

---

## 0. Non-negotiable safety rules

Everything in this brief must be applied **without touching**:

- Authentication / session logic
- Middleware security behavior
- Any backend API route contract
- Any AI provider, AI router, AI prompt, or AI response schema
- Supabase / Mongo schema, RLS, or queries
- S3 upload, storage, quota enforcement
- Stripe / billing / subscription logic
- Plan entitlements
- Super User behavior
- User data handling
- Navigation route names (URLs / paths must remain unchanged)

Refactor **UI only**. If a small frontend wiring fix is required (e.g. wire an existing handler to a new button), document it in the PR description.

**Do not** push directly to `main`. Do not merge automatically. Open one PR for review.

---

## 1. Product principles (apply everywhere)

1. **One primary focus per screen.** Only one hero, one primary CTA, one recommendation at a time. Everything else is quieter.
2. **Human copy, never technical AI copy.** Prefer "SnapNext found something for you" over "AI recommendation generated". Prefer "People you love" over "Face clusters".
3. **Compact by default on mobile.** Media should be visually dominant; metadata should hide until a detail view.
4. **Progressive disclosure.** Complex tools reveal when asked — never dump every option on Home.
5. **Consolidate ownership.** Home = today. Gallery = browse. Memories = rediscover. AI = intelligence. Upload = safe backup. Favorites = private sharing. Nothing repeats across pages except as a quiet preview.
6. **Safe-area everywhere.** No CTA hides under bottom nav or safe-area insets.

---

## 2. Design tokens (Tailwind-friendly, dark theme)

Match SnapNext's existing premium identity (deep obsidian surface, pink/purple/cyan accents, restrained gradients).

### Colors

| Role | Value |
|---|---|
| `--bg-base` | `#0B0C10` |
| `--bg-surface` | `#121318` |
| `--bg-elevated` | `#1A1C23` |
| `--text-primary` | `#F8FAFC` |
| `--text-secondary` | `#94A3B8` |
| `--text-muted` | `#64748B` |
| `--brand-pink` | `#EC4899` |
| `--brand-purple` | `#8B5CF6` |
| `--brand-cyan` | `#06B6D4` |
| `--success` | `#10B981` |
| `--warning` | `#F59E0B` |
| `--error` | `#EF4444` |
| `--border-subtle` | `rgba(255,255,255,0.06)` |
| `--border-default` | `rgba(255,255,255,0.10)` |

**AI gradient (for hero CTAs, primary actions, AI-attributed elements):**  
`linear-gradient(135deg, #EC4899 0%, #8B5CF6 50%, #06B6D4 100%)`

**AI soft glow (for subtle AI-attributed cards):**  
`linear-gradient(135deg, rgba(236,72,153,0.18) 0%, rgba(139,92,246,0.14) 50%, rgba(6,182,212,0.14) 100%)`

### Radius

| Role | px |
|---|---|
| Card | 18–24 |
| Image tile | 12–14 |
| Chip / pill / button | 999 (fully rounded) |
| Input | 12–14 |

### Spacing rhythm

Follow an 8pt grid: 4, 8, 12, 16, 24, 32. Sections separated by 24–32.

### Typography

| Role | Suggestion |
|---|---|
| Page title (H1) | 28px / 700 / tight tracking |
| Section title (H2) | 22px / 700 |
| Card title (H3) | 18px / 600 |
| Body | 14–15px / 400 / line-height 20 |
| Small | 12–13px / 400 |
| Tiny (labels/pills) | 11px / 500 / uppercase 0.6 letter-spacing |

Use SnapNext's existing font stack. Do not introduce a new font.

### Elevation

- Standard card: `bg-[#121318] border border-white/5 rounded-2xl`
- Elevated card (AI-attributed): as above **plus** the AI-soft gradient behind at ~50% opacity
- Sticky/glass header: `bg-[#0B0C10]/70 backdrop-blur-xl border-b border-white/5`

---

## 3. Component conventions

Reuse existing components where possible. When introducing patterns from this brief, prefer these primitives:

- **`SectionHeader`** — a row with `title` + optional `subtitle` + optional right-aligned action link. Used above every horizontal carousel and every list.
- **`DemoBadge`** — **not needed in production**; the mobile blueprint uses it to label demo data. In real SnapNext, no such badge exists.
- **`PrimaryActionCard`** — one per Home; gradient border + AI chip.
- **`InsightCard`** — one per Home; heart icon in gradient, warm copy.
- **`MediaTile`** — square image tile with optional favorite badge, video pill, selection ring.
- **`FilterChipRow`** — horizontal scroller, chips are `flex-shrink-0`, 36pt high, selected chip changes color/border only (never size).
- **`Toast` / `BottomSheet`** — for confirmations. **Never use `alert()`.**

### Testability

Every interactive element and every user-facing informational element must have `data-testid` in **kebab-case** describing role, not appearance. Examples:

```html
data-testid="home-primary-action"
data-testid="gallery-filter-people"
data-testid="upload-primary-cta"
data-testid="favorites-revoke-<id>"
data-testid="media-add-to-story"
```

No duplicates. No omissions on buttons/links/inputs/modals/alerts.

---

## 4. Home / Dashboard

**Route:** existing authenticated home route (do not rename).  
**Job:** answer "what matters today?" within ~5 seconds. Home is not a dashboard of every feature.

### Structure (top to bottom, single column, mobile-first)

1. **Compact personal header**
2. **One adaptive Smart Action**
3. **Today in your life** (On This Day hero)
4. **A gentle observation** (one AI insight)
5. **Continue your story** (horizontal carousel)
6. **Recent moments** (compact horizontal strip)
7. **Capture something new** (3 quick-capture buttons)
8. **Storage** (quiet at bottom)

**Home length target:** significantly shorter than the current Home. Cut anything that duplicates Memories or AI.

### 4.1 Compact personal header

Layout: `avatar (44px) | name+status text block | heart button linking to /favorites`

**Copy — greeting** (adapt by time of day):

- `hour < 5` → "Still up"
- `hour < 12` → "Good morning"
- `hour < 17` → "Good afternoon"
- `hour < 21` → "Good evening"
- else → "Good night"

**Copy — subtitle (fixed, warm):**  
> "Your memories are safe. SnapNext found something for you."

Tap on avatar → navigate to `/settings` (existing route).  
Tap on heart icon → navigate to `/favorites` (existing route).

### 4.2 One adaptive Smart Action

One primary recommendation only. Uses the **existing recommendation logic** — do not fabricate.

Card structure:
- AI chip pill (top): `SnapNext found this for you` with a sparkles icon
- Title (H2): the recommendation title from existing logic
- One line of reason from existing logic
- Solid pill CTA: label from existing logic (e.g. "Continue the story", "Review 12 new memories", "Back up recent moments")

**Copy examples** (from existing recommendation engine, whichever fits):
- "Your July story is taking shape" · "12 unstitched moments from Feb 2026 — ready to become a story" · CTA "Continue the story"
- "Rediscover this day" · CTA "Open collection"
- "Review 12 new memories" · CTA "Take a look"
- "Back up recent moments" · CTA "Back up now"
- "Create a family recap" · CTA "Start recap"

If the recommendation engine returns nothing, show a calm empty-state ("SnapNext is still getting to know your memories. Add a few more, and stories will start to form.") — do **not** show generic AI marketing copy.

### 4.3 Today in your life

Full-width hero card, 240–280 tall, image cover with bottom gradient scrim.

Pill on top-left of scrim: `This day · N years ago` (purple pill).  
Title (H3, white): use existing On-This-Day copy — never fabricate.  
Sub: `N photos worth revisiting`.

Tap → open collection view (existing route).

### 4.4 A gentle observation (single insight)

Small horizontal card with a small gradient heart icon on the left.

**Copy pattern:**
- Title: warm sentence — e.g. "You captured more family moments this month"
- Detail: one supporting fact from existing data — e.g. "38 photos with people you love — mostly weekends at home"
- CTA (text link with chevron): "See the collection" / "See place timeline" / "See what changed"

If no insight is available, show a soft invitation instead of a fake insight:
> "SnapNext will start noticing patterns as more memories are added."

### 4.5 Continue your story (horizontal carousel)

- Cards ~168 × 210
- Full-bleed cover image, dark bottom gradient
- Title (white, 16 / 600), sub (11px, 80% white): `{subtitle} · {count} moments`
- Use existing story/timeline data — do not invent stories.

Section header right-aligned link: "See all" → `/memories`.

### 4.6 Recent moments (compact horizontal strip)

- Tiles ~92 × 116, rounded, horizontal scroll
- Overlays only when relevant: favorite badge (top-right), video play badge (bottom-left)
- No filename, no date, no AI description on tiles

Section header right-aligned link: "Open gallery" → `/gallery`.

### 4.7 Capture something new (progressive disclosure)

Three side-by-side compact buttons:

| Icon | Label | Behavior |
|---|---|---|
| Cyan pencil-like icon | "Thought" | Opens existing thought-note flow |
| Pink cloud-upload icon | "Back up" | Navigates to `/upload` |
| Purple sparkles icon | "Ask" | Navigates to `/ai` |

Do **not** show the entire capture form by default. Reveal it only when a button is pressed.

### 4.8 Storage (quiet, at the bottom)

Small horizontal card with:
- Label: `STORAGE` (tiny uppercase, secondary)
- Value: `{used} GB of {total} GB used`
- Right-side progress bar (~90 × 6, cyan fill)

No upsell copy here. Upgrade lives on `/upload` and `/settings`.

---

## 5. Gallery

**Job:** fastest place to browse the user's library.

### 5.1 Sticky header

Contains:
1. `Gallery` title
2. Right icon: multi-select toggle (`Select` / `Cancel`)
3. Search input, full-width pill:
   - Placeholder: **"Search by moment, person, place, or date"**
   - Clear button on the right when input is non-empty
   - Wire to existing search API
4. Filter chip row (single horizontal scroller, sticky):
   - `All` · `Favorites` · `Videos` · `People` · `Places` · `Events`
   - Chips: `flex-shrink-0`, height 36, `rounded-full`, subtle bg
   - Active chip: pink border + `bg-pink-500/15 text-pink-500` (do **not** change size or weight)
5. When multi-select is on: a select bar appears below the chips with `{n} selected` + `Favorite` / `Share` / `Trash` pill buttons

Chips scroll horizontally. Never wrap. Never reorder. This is chrome, not content.

### 5.2 Grid

- **Two columns on mobile**, gap 4px, cards `aspect-square`, radius 12–14
- **Adaptive on larger screens** — 3 cols at md, 4 cols at lg, 6 cols at xl — but always at max content width (e.g. `max-w-6xl`)
- Card overlays: favorite badge (top-right, pink), video pill with duration (bottom-left), selection ring when in select mode
- **No** filename, size, full AI description, or long date on tiles

**Selection semantics:**
- Long-press or select-mode-on → tap toggles selection
- Selection ring: 22 × 22 circle, white border, pink fill when selected
- In select mode, tap must **not** open detail view

### 5.3 Detail view

Open on tap. Reuse existing media detail route.

Sections (top to bottom):
1. Full media (image or video with play control)
2. Meta: date · title · place · people (if available from existing data)
3. **Primary CTA (gradient pill):** "Add to a story"
4. **SnapNext's take** card (subtle gradient bg): the existing AI description string. Header label uppercase: `SNAPNEXT'S TAKE`
5. Tags row (from existing tags/entities)
6. `MAKE SOMETHING WITH THIS` grid (4 items):
   - Write a caption
   - Draft a post
   - Find similar
   - Share with a favorite
7. Bottom bar (fixed): Love · Share · Save · Trash

Wire every button to the **existing** handler / API call. No new endpoints.

### 5.4 Empty state

If filter or search returns nothing:
> Icon (images-outline in muted circle)  
> **"Nothing here yet"**  
> "Try a different search, or clear the filter to see all your moments."

### 5.5 Performance

Do not regress: keep existing pagination / virtualisation / thumbnail URLs. Use existing image component (`next/image` with the same domain allowlist).

---

## 6. Memories

**Job:** rediscovery. This is where SnapNext becomes emotionally valuable.

### Section order

1. **Today** — On This Day hero (same content as Home; here it can be tapped through)
2. **This day, in past years** — horizontal carousel of 3–7 year-back windows
3. **Stories** — horizontal carousel with story tag pill
4. **People you love** — horizontal avatars carousel with count
5. **Trips & places** — 2-column place cards
6. **Life timeline** — vertical list of month rows (48 × 48 cover + month name + count + hint)

Only include sections that are actually supported by existing data. If face grouping isn't available, hide "People you love". If place data isn't available, hide "Trips & places". Do **not** fabricate.

### Copy examples (warm, quiet)

- Page subtitle under H1: **"Rediscover the moments that made your life."**
- Section subtitles:
  - This day, in past years — "Little windows back in time"
  - Stories — "Chapters SnapNext has been quietly writing"
  - People you love — "Faces that keep showing up"
  - Trips & places — "Where your memories live"
  - Life timeline — "Your months, in one gentle scroll"

Every list row → tap opens the appropriate existing detail route (story, person, place, timeline month). Reuse existing links.

### Home vs Memories rule

Home teases; Memories owns. Do not duplicate all Memories sections back on Home.

---

## 7. AI experience

**Job:** feel like one intelligent assistant. Not a dashboard of disconnected tools.

### 7.1 Page structure

1. Header: `SnapNext AI` + small AI gradient chip icon
2. Subtitle: **"Your quiet intelligence layer"**
3. **Persistent "Ask SnapNext" hero** (always visible at top):
   - Card with soft AI gradient background
   - Title (H2): "Ask SnapNext"
   - Sub (small, secondary): "Anything about your own memories."
   - Prompt input row: sparkles icon | textarea | gradient send button (arrow-up)
   - Placeholder: "Find my beach photos with family"
4. Section label (tiny uppercase, secondary): **"WHAT WOULD YOU LIKE TODAY?"**
5. Capability chips (horizontal scroller, single row):
   - `Ask` (search icon, pink)
   - `Understand` (leaf icon, cyan)
   - `Create` (magic-wand icon, purple)
   - `Organize` (sparkles icon, green)
   - `Remember` (heart icon, blush pink)
   - Selected chip changes color/border only
6. Contextual sub-hero: small card with capability icon + short one-liner
7. `TRY` label + up-to-4 vertical suggestion chips (each launches the prompt)
8. **One primary result block** for the selected capability (never five parallel blocks)

### 7.2 Result block per capability

Use **existing AI APIs and routing.** Do not modify the router.

- **Ask**: `Recent answer` card with title, meta line, thumbnail strip (up to 6). Data: existing search-answer response.
- **Understand**: 3-row insight list, each row has a small icon (location/people/book), title + supporting body. Data: existing "understand" insights endpoint.
- **Create**: 2×N grid of draft cards (Caption / Story / Reel / Post) with tag pill, title, body, small "Preview" link. Data: existing draft generator.
- **Organize**: 3-row cleanup list (duplicates, suggested album, screenshots pile-up) with chevron. Data: existing cleanup endpoint.
- **Remember**: 3-row "waiting for you" list of resurfaced past moments. Data: existing rediscovery endpoint.

### 7.3 Copy examples (all human, none technical)

| Instead of | Use |
|---|---|
| "AI recommendation generated" | "SnapNext found something for you" |
| "Face cluster #7" | "Mom" (from existing person label) |
| "Semantic search results" | "Found 12 photos from your Goa trip" |
| "Media analysis complete" | "SnapNext's take" |
| "Object detected: beach" | "A quiet moment at Goa. The light hits softly across the frame." |
| "Duplicate cluster detected" | "42 possible duplicates" |
| "AI thinking..." | "SnapNext is thinking…" |

### 7.4 Action safety

AI may **suggest** and **prepare**. Publishing, sharing, deletion — always go through the **existing** confirmation and permission checks. No autonomous external actions.

### 7.5 Home vs AI rule

Home gets one insight. Deep AI understanding and creation lives here.

---

## 8. Upload / Backup

**Job:** feel premium, safe, and obvious.

### 8.1 Structure

1. Header: `Back up` + subtitle **"Keep your memories safe, forever."**
2. **Primary CTA (full-width, AI gradient pill):**
   - Title: **"Back up photos and videos"**
   - Sub (existing wording): e.g. "128 new photos and 6 videos are ready to save"
3. **Secondary CTA (outlined pill):** **"Choose specific files"**
4. Honest platform note under the CTAs (12px, muted):
   > "On mobile web, SnapNext can only see files you pick. The native app can quietly back up everything for you."
5. **Current backup card** — see 8.2
6. **Why N were skipped** list — see 8.3
7. **Storage** card with plan name, `X GB of Y GB used`, cyan→purple bar, "Get more space" button (existing plan-upgrade route)
8. **Preferences** card — see 8.4

### 8.2 Current backup card

- Title: `Backing up now` (or `All caught up` when `uploaded === total`)
- Sub: `{uploaded} of {total} saved · {skipped} skipped` (or the "All caught up" summary)
- Percentage (H3) top-right, or green check badge when done
- Progress bar (8px tall, AI gradient fill, animated width)
- Thumbnail strip: 6 × 44 tiles, each with a state badge (bottom-right, 16px circle):

| State | Badge icon | Color | Label |
|---|---|---|---|
| Uploaded | checkmark-circle | success | Saved |
| Uploading | cloud-upload | cyan | Saving |
| Queued | time-outline | secondary | Waiting |
| Skipped | alert-circle | warning | Skipped |
| Failed | close-circle | error | Failed |

All values come from the **existing** upload state. Do not weaken partial-batch acceptance if the backend already supports it.

### 8.3 Skip reason list

Rows: colored icon dot + label + count. Use existing skip taxonomy:

- Already backed up (info)
- Unsupported type (warning)
- File too large (warning)
- Storage full (error) — only if applicable
- Upload error (error) — only if applicable

### 8.4 Preferences

Only surface toggles that map to real functionality:

- **Save data (Wi-Fi only)** — if implemented
- **Back up every day, quietly** — if implemented; if native-only, keep visible but disabled with sub-copy "Available in the native app"

**Do not** surface toggles that have no working backend. If a control looked functional but is dead, either wire it up or hide it.

---

## 9. Favorites — trusted-person sharing

**Job:** communicate that a favorite is a **trusted person**, and that sharing is permission-based, private, revocable.

### 9.1 Structure

1. Back button + `Favorites` title + Invite icon (top-right)
2. **Explanation card** (soft AI gradient background, lock icon):
   > **"People you trust with your memories"**  
   > "A favorite is a trusted person. They only see photos where both of you appear — nothing else in your library — unless you explicitly share an album."
3. **Primary CTA (AI gradient pill):** **"Invite someone you love"**
4. `Your trusted people` list
5. Privacy do/don't card at the bottom

### 9.2 Row states (status pill next to name)

| Status | Pill label | Pill color |
|---|---|---|
| `accepted` | `Trusted` | success (green) |
| `pending` (you invited them) | `Waiting for reply` | warning (amber) |
| `invited` (they invited you) | `Wants to connect` | cyan |

Row right side:

- `accepted` → chevron down / up to reveal permission panel
- `pending` → `Remind` pill button
- `invited` → `Accept` (pink) + `Decline` (subtle) pill buttons

Sub-line copy examples:
- accepted: `47 shared moments · Connected since Mar 2024`
- pending: `Invitation sent 2 days ago`
- invited: `Priya invited you`

### 9.3 Expanded permission panel (for accepted rows)

- Small info row explaining current access level, e.g.:
  - `Sees photos with both of you` (default)
  - `Sees photos with both of you + selected albums` (extended)
- Two action pills side-by-side:
  - `Manage shared albums` (opens existing album-share modal)
  - `Revoke access` (danger red on `bg-red-500/10`)

Wire `Revoke access` to the **existing** revocation endpoint. Show a confirmation `BottomSheet`/`Toast`, not `alert()`.

### 9.4 Privacy do/don't card (bottom)

Four rows, each with a check or cross icon:

- ✅ "They see only what you share, nothing more."
- ✅ "Photos with both of you may be quietly suggested."
- ❌ "They never see your private library."
- ✅ "You can revoke access anytime — quietly, instantly."

### 9.5 Never imply

- Never imply favorites automatically gain access to another person's private library.
- Never imply face-recognition capabilities that don't exist in the current backend.

---

## 10. Bottom navigation & safe-area rules

### 10.1 Nav model

Keep existing routes. The visual model in the blueprint is:

`Home · Gallery · [Upload center gradient] · Memories · AI`

Only apply the center-Upload gradient button if it fits SnapNext's existing nav architecture. **Do not add or rename routes** without evidence.

### 10.2 Overlap fix (critical)

Currently the floating bottom nav overlaps the last card / CTA on many pages. Fix by:

1. Every scrollable authenticated page: add `padding-bottom` equal to `bottom-nav-height + safe-area-inset-bottom + 24px`.
2. Sticky bottom bars (media detail actions): add `padding-bottom: max(env(safe-area-inset-bottom), 12px)`.
3. Fixed nav container itself: apply `pb-[env(safe-area-inset-bottom)]` (or Tailwind arbitrary variant) so the nav visually clears the home indicator on iOS.
4. Never let an important CTA sit underneath the nav. Test at 375 / 390 / 430 / 768 / 1024 / 1440 widths.

### 10.3 Hit targets

Every tab button and nav icon: minimum 44 × 44 tap target.

---

## 11. Loading, empty, error states

Every module/section must handle:

- **Loading:** skeleton (matching the module's card shape). No blank sections. No spinners in the middle of the page.
- **Empty (new user):** warm, explains the value. Example (Memories, no data yet): "SnapNext is still getting to know your memories. As you add moments, timelines and stories will start to appear."
- **Empty (no results):** filter/search variant — "Nothing here yet."
- **API error (per module):** compact card, "Something went wrong. Retry." — do **not** replace the whole page.

Never silently substitute fabricated data for a failed AI response. Generic fallback must clearly be generic.

---

## 12. Motion (subtle, tasteful)

Optional but recommended. Do not overuse.

- Home blocks on mount: staggered fade + 12px rise, ~70ms stagger, ~420ms duration.
- Card press: `active:scale-[0.98]` transition.
- AI "thinking" indicator: 3 dots with soft pulse.
- Upload complete: brief green check bounce.
- Story cover transition: cross-fade when navigating in/out.

Use existing motion library if any (Framer Motion is fine in Next.js). Do not introduce a new one.

---

## 13. Backend / API preservation rules

- **Do not** rename or restructure any API endpoint.
- **Do not** change request/response shapes.
- **Do not** change auth cookies, sessions, or middleware order.
- **Do not** change Supabase RLS policies or Mongo collection names.
- **Do not** change S3 bucket ACLs, presigning behavior, or ownership metadata.
- **Do not** change Stripe webhook handling, plan gating, or entitlement checks.
- **Do not** change Super User bypass logic.
- All UI wiring uses the **existing** service functions/hooks/queries. If you must create a new hook, it should be a **thin wrapper** over an existing service — no new fetch logic, no new endpoints.

If a UI change genuinely requires a small server change (e.g. surfacing an already-computed field), document it clearly and separately in the PR.

---

## 14. AI functionality preservation rules

- **Do not** change AI provider selection.
- **Do not** modify the AI router.
- **Do not** modify prompts, temperature, or model parameters.
- **Do not** change quota enforcement or entitlement checks.
- **Do not** introduce autonomous external actions.
- Reuse the **existing** AI endpoints for Ask, Understand, Create, Organize, Remember. If a capability doesn't exist server-side, do not add it in this PR — instead, hide the corresponding chip.

---

## 15. Regression checklist (must pass before requesting review)

### Auth
- [ ] Login works
- [ ] Session persistence works
- [ ] Protected routes remain protected
- [ ] Sign-out works

### Home
- [ ] User data loads
- [ ] Storage data loads
- [ ] Recommendation card links work
- [ ] Today card opens the correct collection
- [ ] Insight CTA opens the correct destination
- [ ] Recent-moments strip opens media detail
- [ ] Quick-capture buttons route correctly

### Gallery
- [ ] Media loads
- [ ] Search works (wired to existing API)
- [ ] All six filter chips work
- [ ] Favorite toggle works
- [ ] Multi-select works
- [ ] Bulk favorite / share / trash work
- [ ] Detail view opens correct media
- [ ] Trash uses existing endpoint

### Memories
- [ ] Today hero loads
- [ ] This-day-in-past-years loads
- [ ] Stories carousel loads
- [ ] People carousel loads (only if backend supports)
- [ ] Trips & places grid loads (only if backend supports)
- [ ] Life timeline scrolls and each row navigates

### AI
- [ ] Ask hero submits and returns existing search
- [ ] Understand renders existing insights
- [ ] Create renders existing drafts
- [ ] Organize renders existing cleanup suggestions
- [ ] Remember renders existing rediscovery items
- [ ] Loading + error states appear correctly
- [ ] Quotas / entitlements still enforced

### Upload
- [ ] Primary "Back up photos and videos" invokes existing bulk upload
- [ ] Secondary "Choose specific files" opens native picker
- [ ] Progress states render correctly per file
- [ ] Skip reasons render with existing counts
- [ ] Storage card shows correct plan and usage
- [ ] Preferences toggle only what's actually wired

### Favorites
- [ ] Invitation flow works
- [ ] Accept / Decline works
- [ ] Remind works
- [ ] Permission panel expands correctly
- [ ] Manage shared albums opens existing modal
- [ ] Revoke access hits existing endpoint and confirms via toast/sheet
- [ ] Privacy list renders

### Navigation & layout
- [ ] Bottom nav does not cover any CTA at 375 / 390 / 430 / 768 / 1024 / 1440
- [ ] Safe-area handled on iOS home-indicator devices
- [ ] No horizontal overflow anywhere
- [ ] No text clipping in headers
- [ ] Filter chip rows scroll horizontally, never wrap

---

## 16. Lint / Build checklist

Run these locally on the branch before opening the PR. Report exact output in the PR description.

```bash
git checkout preview/complete-app-ux-v2
npm ci
npm run lint
npm run build
```

If tests are configured:

```bash
npm test
```

If any command fails, note whether it failed **before** this branch or **because of** this branch. Do not claim success if any command fails.

If Playwright / e2e tests exist for the affected pages, run them as well and paste the summary.

---

## 17. Git & PR workflow

1. **Branch:** work on `preview/complete-app-ux-v2` only. Never push to `main`.
2. **Commits:** small, purposeful commits per section (Home, Gallery, Memories, AI, Upload, Favorites, Nav). Not one giant commit.
3. **PR target:** `main`
4. **PR title:** `UX consolidation — Home / Gallery / Memories / AI / Upload / Favorites`
5. **PR description must include:**
   - Summary of UX problems solved
   - List of pages changed
   - List of components changed
   - List of files touched (paste `git diff --stat`)
   - Functionality preserved (link to the regression checklist above with all items checked)
   - `npm run lint` output
   - `npm run build` output
   - Test output if applicable
   - Screenshots for each changed screen at 390 px and 1024 px
   - Preview deployment link if the repo builds preview URLs
   - Known limitations / follow-ups
6. **Do not enable auto-merge.** Do not merge. Wait for review.
7. **Rollback:** the entire change must be revertable by closing the PR and deleting the branch. No database migration should be required. No backend rollback should be required.

---

## 18. Do / Don't recap

### Do
- Reuse existing components, hooks, services, and routes
- Use human, warm product language
- Keep one primary focus per screen
- Fix safe-area / bottom-nav overlap on every scrollable page
- Add `data-testid` to every interactive element
- Preserve every existing handler, endpoint, and permission check

### Don't
- Introduce a new framework, router, or design system
- Rename routes, endpoints, or fields
- Add new AI providers or change AI routing
- Fabricate AI insights, memories, faces, places, or numbers
- Weaken RLS, S3 ownership, quotas, entitlements, or Super User behavior
- Push to `main`, auto-merge, or squash without review

---

## 19. Copy strings — quick reference table

| Location | Copy |
|---|---|
| Home subtitle | "Your memories are safe. SnapNext found something for you." |
| Home AI chip | "SnapNext found this for you" |
| Home section — Today | "Today in your life" |
| Home section — Insight | "A gentle observation" |
| Home section — Stories | "Continue your story" (right link: "See all") |
| Home section — Recent | "Recent moments" (right link: "Open gallery") |
| Home section — Capture | "Capture something new" |
| Home quick-capture labels | "Thought" · "Back up" · "Ask" |
| Home footer note (dev/staging only) | "Prototype · Demo memories only" (remove in prod) |
| Gallery search placeholder | "Search by moment, person, place, or date" |
| Gallery filter chips | All · Favorites · Videos · People · Places · Events |
| Gallery empty | "Nothing here yet" / "Try a different search, or clear the filter to see all your moments." |
| Memories subtitle | "Rediscover the moments that made your life." |
| Memories section — Today | "Today" |
| Memories section — Past | "This day, in past years" / "Little windows back in time" |
| Memories section — Stories | "Stories" / "Chapters SnapNext has been quietly writing" |
| Memories section — People | "People you love" / "Faces that keep showing up" |
| Memories section — Places | "Trips & places" / "Where your memories live" |
| Memories section — Timeline | "Life timeline" / "Your months, in one gentle scroll" |
| AI subtitle | "Your quiet intelligence layer" |
| AI hero title | "Ask SnapNext" |
| AI hero sub | "Anything about your own memories." |
| AI capabilities label | "WHAT WOULD YOU LIKE TODAY?" |
| AI capabilities | Ask · Understand · Create · Organize · Remember |
| Upload subtitle | "Keep your memories safe, forever." |
| Upload primary CTA | "Back up photos and videos" |
| Upload secondary CTA | "Choose specific files" |
| Upload picker note | "On mobile web, SnapNext can only see files you pick. The native app can quietly back up everything for you." |
| Upload progress title (in-progress) | "Backing up now" |
| Upload progress title (done) | "All caught up" |
| Upload skip section | "Why {n} were skipped" |
| Upload upgrade CTA | "Get more space" |
| Favorites title | "Favorites" |
| Favorites explanation title | "People you trust with your memories" |
| Favorites explanation body | "A favorite is a trusted person. They only see photos where both of you appear — nothing else in your library — unless you explicitly share an album." |
| Favorites invite CTA | "Invite someone you love" |
| Favorites list title | "Your trusted people" |
| Favorites status pills | Trusted / Waiting for reply / Wants to connect |
| Favorites revoke button | "Revoke access" |
| Media detail primary CTA | "Add to a story" |
| Media detail AI card header | "SNAPNEXT'S TAKE" |
| Media detail actions grid header | "MAKE SOMETHING WITH THIS" |
| Media detail bottom bar | Love · Share · Save · Trash |

---

## 20. Final product standard

The completed SnapNext experience should feel:

- **Home** tells me what matters now.
- **Gallery** lets me browse everything quickly.
- **Memories** helps me rediscover my life.
- **AI** helps me understand and create from my digital life.
- **Upload** protects new memories safely.
- **Favorites** connects people privately with clear permission.

The app should feel simpler even though all existing capabilities remain available.

The objective is not to show users how many features SnapNext has.  
The objective is to make users feel:
> "My digital life is safe, understood, easy to find, and ready when I need it."

---

_This brief is derived from a mobile UX prototype and translated for the SnapNext Next.js codebase. Implement iteratively, screen by screen, and open the PR for review only after Section 15 (Regression checklist) and Section 16 (Lint / Build) are green._
