# SnapNext AI — Mobile UX Prototype (Reference Only)

## Purpose
A **mobile UI/UX reference prototype** that visualizes the "Complete Authenticated App UX Consolidation" direction described in the SnapNext brief, so it can be studied before any changes are made to the real Next.js SnapNext repository.

- **Prototype only.** All content is mock/demo data — clearly labelled with a `DEMO DATA` pill on every screen.
- **No backend.** No API calls, no auth, no real uploads, no real AI. Nothing here is a production system.
- **Not a replacement.** Does not replace the existing Next.js app, its APIs, S3, Supabase, Stripe, or auth.

## Polish pass — feel of the product
After the polish pass, SnapNext feels like a **premium, emotionally intelligent personal AI life OS**:
- Human copy everywhere ("SnapNext found something for you", "A gentle observation", "People you love", "Little windows back in time", "SnapNext's take", "Trusted people")
- One primary focus per screen; secondary content quieter
- Micro-motion on Home (staggered fade + rise for each block) — subtle, not gimmicky
- Compact horizontal Recent Moments strip (replaced the earlier 2×2 grid)
- Storage sits quietly at the bottom of Home — not competing with today's memory
- Media detail leads with "Add to a story" (gradient CTA) — the emotional next step, not a technical action

## Stack
- Expo SDK 54, React Native + Expo Router (file-based routing)
- `expo-linear-gradient`, `@expo/vector-icons`, `react-native-safe-area-context`
- Static mock data lives at `frontend/src/data/mocks.ts`
- Design tokens at `frontend/src/theme/index.ts`

## Screens (matching the brief's product ownership model)
- **Home = Daily Command Center** (`app/(tabs)/index.tsx`)
  - Compact personal header + warm subtitle "Your memories are safe. SnapNext found something for you."
  - ONE primary Smart Action ("Your July story is taking shape")
  - Today card — On This Day hero
  - ONE AI insight — "A gentle observation"
  - Continue-your-story horizontal row
  - Recent moments — compact horizontal strip (~92pt tiles)
  - Quick Capture: Thought / Back up / Ask
  - Quiet Storage bar at the very bottom
- **Gallery = fast browsing** (`app/(tabs)/gallery.tsx`)
  - 2-col compact grid, minimal metadata
  - Filters: All · Favorites · Videos · People · Places · Events (real filtering on demo people/places)
  - Search by moment, person, place, or date
  - Multi-select mode with bulk favorite/share/trash
- **Upload = safe backup** (`app/(tabs)/upload.tsx`)
  - "Back up photos and videos" primary CTA · "Choose specific files" secondary
  - Honest mobile-web picker note
  - Progress card with per-thumbnail state badges (Saved / Saving / Waiting / Skipped)
  - "Why 18 were skipped" reason list, "SnapNext Pro" storage card, gentle preferences
- **Memories = rediscovery** (`app/(tabs)/memories.tsx`)
  - Today hero → This day, in past years (3/5/7 years ago) → Stories → People you love → Trips & places → Life timeline
- **AI = one intelligent assistant** (`app/(tabs)/ai.tsx`)
  - Persistent "Ask SnapNext" hero (natural-language input)
  - Quieter capability chips: Ask · Understand · Create · Organize · Remember
  - Contextual sub-hero + example prompts + one primary result block per capability
- **Favorites = trusted-person sharing** (`app/favorites.tsx`)
  - "People you trust with your memories" explanation
  - Status pills: Trusted / Waiting for reply / Wants to connect
  - Expandable row → shows access level ("Sees photos with both of you"), Manage shared albums, Revoke access
  - Explicit privacy do/don't list including revoke-anytime
- **Settings** (`app/settings.tsx`) — Profile + Account/Privacy/AI/Backup/App sections
- **Media Detail (modal)** (`app/media/[id].tsx`)
  - Full image, date, place, people
  - Primary "Add to a story" gradient CTA
  - "SnapNext's take" AI description
  - Tags, quick actions grid (Write a caption / Draft a post / Find similar / Share with a favorite)
  - Bottom action bar: Love / Share / Save / Trash

## Interaction highlights the prototype demonstrates
- No content hidden behind bottom nav (safe-area handled, screens padded)
- Sticky headers with search + horizontally-scrollable filter chips
- Progressive disclosure via bottom-bar / modal for detail views
- Only ONE primary action per Home section — matches the brief's cognitive-load reduction goal
- Clear empty states, loading uses lightweight views
- Every interactive element has a kebab-case `testID`
- Dark surfaces + pink/purple/cyan restrained gradients matching SnapNext identity

## What this prototype is NOT
- Not connected to any backend / API
- Not an auth-enabled app
- Not a production build
- Not intended to be merged into the SnapNext Next.js repo

## Next Steps for the Real Next.js Work
Use these screens as the reference for consolidating the actual authenticated SnapNext app on branch `preview/complete-app-ux-v2`:
1. Home consolidation (compact header, one primary action, one insight)
2. Gallery density (compact 2-col grid, minimal metadata)
3. Memories hierarchy
4. AI job model (Ask / Understand / Create / Organize)
5. Upload clarity (states + honest platform limits)
6. Favorites permission clarity
7. App-wide bottom-nav padding + safe-area fixes
