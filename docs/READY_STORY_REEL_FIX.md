# Ready Story reel playback fix

- Story frames continue to advance even when the device requests reduced motion; only the zoom/fade animation is suppressed.
- The soundtrack control is an explicit interactive Tap for sound button rather than a passive muted badge.
- Audio remains muted by default and starts only after a user gesture.
- Cached Ready Story visual payloads must be refreshed when reel or collage selections change.
