# SnapNext AI — Mobile UX Prototype (Reference Only)

## Purpose
A **mobile UI/UX reference prototype** that visualizes the "Complete Authenticated App UX Consolidation" direction described in the SnapNext brief, so it can be studied before any changes are made to the real Next.js SnapNext repository.

- **Prototype only.** All content is mock/demo data — clearly labelled with a `DEMO DATA` pill on every screen.
- **No backend.** No API calls, no auth, no real uploads, no real AI. Nothing here is a production system.
- **Not a replacement.** Does not replace the existing Next.js app, its APIs, S3, Supabase, Stripe, or auth.

## Stack
- Expo SDK 54, React Native + Expo Router (file-based routing)
- `expo-linear-gradient`, `@expo/vector-icons`, `react-native-safe-area-context`
- Static mock data lives at `frontend/src/data/mocks.ts`
- Design tokens at `frontend/src/theme/index.ts`

## Screens (matching the brief's product ownership model)
- **Home = Daily Command Center** (`app/(tabs)/index.tsx`)
  - Compact personal header (greeting + storage status)
  - ONE primary smart action (AI recommendation)
  - Today card (On This Day)
  - ONE AI insight
  - Continue-your-story horizontal row
  - Compact recent-memories 2-col grid
  - Quick Capture (progressive disclosure entry: Note / Media / AI Storyteller)
- **Gallery = fast browsing** (`app/(tabs)/gallery.tsx`)
  - 2-col compact grid, minimal metadata
  - Search bar + sticky filter chips row (single horizontal scroller)
  - Multi-select mode with bulk favorite / share / trash
- **Upload = safe backup** (`app/(tabs)/upload.tsx`)
  - "Back up everything" primary CTA (gradient)
  - "Pick specific photos & videos" secondary
  - Honest note about mobile-web picker limitation
  - Progress card: uploaded / total / skipped, thumbnails w/ state badges
  - Skip-reason list, storage card, backup preferences
- **Memories = rediscovery** (`app/(tabs)/memories.tsx`)
  - On This Day hero → Timeline → Stories → People → Places → Rediscovery
- **AI = ask/understand/create/organize** (`app/(tabs)/ai.tsx`)
  - Tabs with prompt hero + example chips
  - Answer preview / insights / draft cards per tab
- **Favorites = private sharing** (`app/favorites.tsx`)
  - Permission-based explanation, invite CTA
  - Rows with status pills: Connected / Waiting for reply / Invite you sent
  - Explicit privacy do/don't list
- **Settings** (`app/settings.tsx`)
  - Profile card + Account / Privacy / AI / Backup / App sections
- **Media Detail** (`app/media/[id].tsx`)
  - Modal presentation, AI description card, tags, AI actions, bottom bar

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
