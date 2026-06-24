# SnapNext 3.0 — Source of Truth

Status: Approved for next build direction  
Preview route: `/snapnext-v3`  
Preview branch: `snapnext-merged-build`

## Final Product Direction

SnapNext is not a cloud storage app. SnapNext is a private AI-powered memory home.

Core positioning:

> Every Memory. Every Story. Forever.

SnapNext should feel like a family memory network, not a storage dashboard.

## Approved Navigation

Bottom navigation should be limited to five primary tabs:

1. Home
2. Vault
3. Stories
4. Create
5. People

Admin, Settings, Billing, Storage, Logout, and Super User controls should move into the profile/avatar menu.

## Approved Home Structure

Home should prioritize emotion, relationships, and memories.

Order:

1. Greeting / Your Memory Home
2. Favorite People story circles
3. Memory of the Day hero card
4. Backup Everything action
5. Create Reel / AI Search / Invite Family quick actions
6. Today's AI Discovery
7. Recent Memories grid

Home must not feel like a dashboard first. Storage and technical stats should be secondary.

## Approved Vault Direction

Library is renamed to Vault.

Vault should include:

- AI search bar
- Dense photo grid
- Filters: All, Photos, Videos, Favorites, People, Stories
- Storage summary
- No large empty white gaps between months
- Default view should feel full, visual, and alive

Avoid timeline layouts that waste vertical space.

## Approved Stories Direction

Stories is the emotional heart of SnapNext.

Story categories:

- Today
- On This Day
- Trips
- Birthdays
- Family
- Festivals

Story cards should include:

- Large visual memory card
- Number of photos/videos
- AI caption readiness
- Suggested reel/story action

## Approved Create Direction

Create should be goal-based, not prompt-first.

Primary creation options:

- Caption
- Reel
- Story
- Emoji Pack
- Timeline
- Export

User should not need to understand AI prompting. They choose a goal, select memories, and SnapNext guides the rest.

## Approved People Direction

People is SnapNext's strongest differentiator.

People page should include:

- Favorite people
- Relationship labels
- Shared memory counts
- Shared albums
- Permission controls
- Private memory chat entry point

Default sharing rule:

Only photos where both people appear should be shared unless the owner grants additional album permissions.

## Features To Preserve From Existing App

Keep all working backend/product systems:

- Auth
- Upload engine
- AWS S3 media storage
- Storage quota enforcement
- Gallery/media metadata
- Trash/restore
- Downloads/export
- AI captions and stories
- Stripe billing
- Super User system
- Favorite sharing permissions

Do not weaken backend security while improving UI.

## Features To Bring From Clone UI

The clone UI contributed the strongest emotional product ideas:

- Family story circles
- Favorite people activity
- Memory hero cards
- Face/person filtering
- Smart storage assistant
- AI suggestions
- Relationship-first design

Use these ideas inside the cleaner Emergent visual system.

## UX Rules

1. Use human language, not technical language.
2. Avoid terms like S3, Core V3, Multi-modal, Auto Face Match in user-facing screens.
3. Make the app feel alive even with few photos.
4. Hide Admin from normal navigation.
5. Prioritize mobile-first design.
6. Use large visual memory cards.
7. Keep upload simple: Backup Everything first.
8. Make family, people, and memories visible immediately.

## Next Build Checklist

### P0

- Convert `/snapnext-v3` preview into real production screen architecture.
- Remove Admin from bottom navigation.
- Rename Library to Vault.
- Replace dashboard-first Home with memory-first Home.
- Fix Gallery/Vault empty state and grid density.
- Hide email verification banner in demo/review mode.

### P1

- Connect V3 Home to real media API.
- Connect Vault grid to real media API.
- Connect Stories to Memories / On This Day API.
- Connect People to favorites/sharing permissions.
- Connect Create cards to existing AI functions.

### P2

- Add AI search.
- Add private memory chat.
- Add community albums.
- Add memory capsules.

## Review URL

Use this route for current approved preview:

`/snapnext-v3`
