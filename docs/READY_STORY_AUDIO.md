# Ready Story free audio

SnapNext Ready Stories may offer optional music while the visual story remains muted by default.

## Current source

- Provider: Wikimedia Commons
- Track: Chill Beat
- Author: Maddy
- License: CC0 1.0 Universal Public Domain Dedication
- Uploaded: 2026-02-22
- Attribution: not required by CC0
- Commercial use: allowed under CC0

The application stores source and license metadata in `lib/ready-story-audio.js`. Audio is not preloaded while muted (`preload="none"`) and audible playback starts only after the user taps the sound control, preserving browser autoplay behavior and avoiding unnecessary audio transfer.

## Guardrails

Only tracks with explicit reusable license metadata should be added to the catalog. Prefer CC0/public-domain material for default in-app soundtracks. Do not add a track solely because a site labels it “free”; review the actual license and redistribution/commercial-use terms first.
