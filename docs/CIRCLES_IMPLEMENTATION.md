# Circles implementation foundation

Circles is implemented as an isolated SnapNext module.

## Included in this branch

- Private per-user Circle CRUD
- Per-Circle social source management
- Rights-aware connection modes
- Safe profile-link normalization
- Feed and update-state API foundations
- MongoDB indexes and ownership filters
- Circles management interface
- Platform-specific disclosure for live-ready, OAuth-required and link-only sources

## Integrity boundaries

This branch does not change Gallery, Favorites, Memories, AI Studio, Ready to Post, Community, Chat, storage, billing, authentication or existing API behavior.

## Live integrations

The foundation intentionally does not scrape social platforms. Live adapters must be activated only through approved APIs, OAuth, creator authorization, official embeds or deep links. Until credentials and platform approval are configured, sources remain clearly labelled as pending setup or link-only.

## Next implementation slice

1. Add Circles to the AppShell navigation after UI review.
2. Implement adapter registry and worker queue.
3. Activate YouTube, X, GitHub and RSS adapters.
4. Add AI ranking and digest generation.
5. Connect selected Circle highlights to Today.
